import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { generateTokenAndSetCookie, clearAuthCookie } from '../utils/generateToken.js';
import { validateRegistration, validateLogin } from '../utils/validators.js';
import {
  sendOtpEmail,
  sendWelcomeEmail,
  sendNewUserAdminAlert,
  sendPasswordResetEmail,
  sendTestEmailDiagnostic,
} from '../services/emailService.js';
import { customerAccessTokenCreate, customerCreate } from '../services/shopifyService.js';

// In-memory registration store for active OTP verification sessions (auto-cleans after 10m)
const pendingRegistrations = new Map();

const setPendingRegistration = (email, data) => {
  const existing = pendingRegistrations.get(email);
  if (existing?.timer) clearTimeout(existing.timer);

  const timer = setTimeout(() => {
    pendingRegistrations.delete(email);
  }, 10 * 60 * 1000);

  pendingRegistrations.set(email, { ...data, timer });
};

const getPendingRegistration = (email, req) => {
  const mem = pendingRegistrations.get(email);
  if (mem) return mem;

  if (req?.cookies?.pending_token) {
    try {
      const decoded = jwt.verify(
        req.cookies.pending_token,
        process.env.JWT_SECRET || 'velmora-secret-key-2026'
      );
      if (decoded?.email === email) {
        return decoded;
      }
    } catch {
      // Expired or invalid
    }
  }
  return null;
};

const clearPendingRegistration = (email, res) => {
  const existing = pendingRegistrations.get(email);
  if (existing?.timer) clearTimeout(existing.timer);
  pendingRegistrations.delete(email);

  if (res) {
    res.clearCookie('pending_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }
};

/**
 * @desc    Register a new user & dispatch 6-digit verification OTP
 * @route   POST /api/auth/register
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const { fullName, email, password, phoneNumber, phone } = req.body;
    const effectivePhone = phoneNumber || phone || '';

    // 1. Validate fields
    const { isValid, errors } = validateRegistration({
      fullName,
      email,
      password,
      phoneNumber: effectivePhone,
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join(' '),
        errors,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Check if user already exists in User collection
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.',
      });
    }

    // 3. Generate 6-digit verification OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    // 4. Store registration details in session memory (NO database collection entry until verified)
    const pendingData = {
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      phoneNumber: effectivePhone.trim(),
      otp,
      otpExpire,
    };
    setPendingRegistration(normalizedEmail, pendingData);

    // Also set encrypted/signed cookie as a stateless backup
    const pendingToken = jwt.sign(
      pendingData,
      process.env.JWT_SECRET || 'velmora-secret-key-2026',
      { expiresIn: '10m' }
    );
    res.cookie('pending_token', pendingToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });

    // 5. Dispatch OTP email asynchronously in background
    sendOtpEmail({
      to: normalizedEmail,
      fullName: fullName.trim(),
      otp,
    }).catch((err) => {
      console.error(`[Email Service Error] Failed to send OTP to ${normalizedEmail}:`, err.message);
    });

    return res.status(200).json({
      success: true,
      requiresVerification: true,
      email: normalizedEmail,
      message: 'A 6-digit verification code has been dispatched to your email. Please verify to complete your account setup.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify OTP code and authenticate user
 * @route   POST /api/auth/verify-otp
 * @access  Public
 */
export const verifyOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both your registered email address and the 6-digit OTP code.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 1. Check if user already verified and exists in User collection
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      const token = generateTokenAndSetCookie(res, existingUser._id, existingUser.role);
      return res.status(200).json({
        success: true,
        message: 'Your account is already verified. Logged in successfully.',
        user: existingUser.toJSON(),
        token,
      });
    }

    // 2. Look up pending registration
    const pending = getPendingRegistration(normalizedEmail, req);
    if (!pending) {
      return res.status(404).json({
        success: false,
        message: 'No pending registration found for this email address or verification code expired. Please sign up again.',
      });
    }

    if (!pending.otp || pending.otp !== otp.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect verification code. Please check your email and try again.',
      });
    }

    if (pending.otpExpire && pending.otpExpire < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired (10 minutes limit). Please sign up again.',
      });
    }

    // 3. NOW AND ONLY NOW: Create the verified user in the database
    const user = new User({
      fullName: pending.fullName,
      email: pending.email,
      password: pending.password,
      phoneNumber: pending.phoneNumber,
      role: 'customer',
      isVerified: true,
    });

    // Auto-create & link customer in Shopify Storefront (non-blocking)
    try {
      const nameParts = (user.fullName || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || firstName;
      const shopifyCustomer = await customerCreate({
        email: normalizedEmail,
        password: pending.password,
        firstName,
        lastName,
      });
      if (shopifyCustomer?.customer?.id) {
        user.shopifyCustomerId = shopifyCustomer.customer.id;
      }
      const authRes = await customerAccessTokenCreate(normalizedEmail, pending.password);
      if (authRes?.customerAccessToken?.accessToken) {
        user.shopifyCustomerAccessToken = authRes.customerAccessToken.accessToken;
      }
    } catch (shopifySyncErr) {
      console.warn('[Shopify Customer Sync Warning]', shopifySyncErr.message);
    }

    // Save into database
    await user.save();

    // 4. Remove pending registration
    clearPendingRegistration(normalizedEmail, res);

    // 5. Dispatch welcome email asynchronously
    sendWelcomeEmail({ to: user.email, fullName: user.fullName }).catch((err) =>
      console.warn('[Welcome Email Notice]', err.message)
    );

    // 6. Notify Store Admin (velmora.shop.india.2026@gmail.com) of the confirmed new registration
    sendNewUserAdminAlert({
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber,
    }).catch((err) => {
      console.warn('[Admin Alert Warning] Failed to notify admin:', err.message);
    });

    // 7. Generate JWT & set HTTP-only cookie
    const token = generateTokenAndSetCookie(res, user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Account verified successfully! Welcome to Velmora.',
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Resend 6-digit OTP code
 * @route   POST /api/auth/resend-otp
 * @access  Public
 */
export const resendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required to resend verification code.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This account is already verified. Please sign in directly.',
      });
    }

    const pending = getPendingRegistration(normalizedEmail, req);
    if (!pending) {
      return res.status(404).json({
        success: false,
        message: 'No pending registration found with this email address. Please sign up.',
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = Date.now() + 10 * 60 * 1000;
    const updated = { ...pending, otp, otpExpire };
    setPendingRegistration(normalizedEmail, updated);

    const pendingToken = jwt.sign(
      updated,
      process.env.JWT_SECRET || 'velmora-secret-key-2026',
      { expiresIn: '10m' }
    );
    res.cookie('pending_token', pendingToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });

    sendOtpEmail({
      to: normalizedEmail,
      fullName: updated.fullName,
      otp,
    }).catch((err) => {
      console.error(`[Email Service Error] Failed to resend OTP to ${normalizedEmail}:`, err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'A fresh 6-digit verification code has been dispatched to your email.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & get token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    const { isValid, errors } = validateLogin({ email, password });
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: errors.join(' '),
        errors,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // 2. Find user in User database
    const user = await User.findOne({ email: normalizedEmail }).select(
      '+password +shopifyCustomerAccessToken'
    );

    if (!user) {
      // Check if user has an unverified pending registration
      const pending = getPendingRegistration(normalizedEmail, req);
      if (pending) {
        return res.status(401).json({
          success: false,
          isUnverified: true,
          message: 'Your email address is not verified yet. Please create your account again to receive a verification code.',
        });
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials.',
      });
    }

    // Check if account has completed email OTP verification (if existing document)
    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        isUnverified: true,
        message: 'Your email address is not verified yet. Please create your account again to receive a verification code.',
      });
    }

    // 3. Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials.',
      });
    }

    // 4. Check/Refresh Shopify Customer Token in background if supported
    try {
      let shopifyAuth = await customerAccessTokenCreate(normalizedEmail, password);
      // If customer doesn't exist yet on Shopify, auto-create them and re-authenticate
      if (!shopifyAuth?.customerAccessToken?.accessToken) {
        const nameParts = (user.fullName || '').trim().split(' ');
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || firstName;
        const newCustomer = await customerCreate({
          email: normalizedEmail,
          password,
          firstName,
          lastName,
        });
        if (newCustomer?.customer?.id) {
          user.shopifyCustomerId = newCustomer.customer.id;
        }
        shopifyAuth = await customerAccessTokenCreate(normalizedEmail, password);
      }
      if (shopifyAuth?.customerAccessToken?.accessToken) {
        user.shopifyCustomerAccessToken = shopifyAuth.customerAccessToken.accessToken;
        await user.save({ validateBeforeSave: false });
      }
    } catch {
      // Ignore Shopify customer auth sync error on login
    }

    // 5. Generate JWT & set secure cookie
    const token = generateTokenAndSetCookie(res, user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Welcome back to Velmora.',
      user: user.toJSON(),
      token,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Log out user & clear HTTP-only cookie
 * @route   POST /api/auth/logout
 * @access  Public / Protected
 */
export const logoutUser = async (req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({
    success: true,
    message: 'Signed out successfully.',
  });
};

/**
 * @desc    Get currently logged-in user profile
 * @route   GET /api/auth/me
 * @access  Protected
 */
export const getMe = async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user.toJSON(),
  });
};

/**
 * @desc    Request password reset email
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide an email address.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      // Do not disclose whether email exists for security
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, we have dispatched password reset instructions.',
      });
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Build reset URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Dispatch password reset email asynchronously in background
    sendPasswordResetEmail({ to: user.email, resetUrl }).catch((err) => {
      console.error(`[Email Service Error] Failed to send password reset email to ${user.email}:`, err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset instructions have been dispatched to your email.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using valid token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password, newPassword } = req.body;
    const effectivePassword = password || newPassword;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Reset token is required.' });
    }
    if (!effectivePassword || effectivePassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    // Hash token from body to match stored SHA-256 hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token. Please request a new link.',
      });
    }

    // Set new password
    user.password = effectivePassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Log the user in
    const authToken = generateTokenAndSetCookie(res, user._id, user.role);

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully. You are now logged in.',
      user: user.toJSON(),
      token: authToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Diagnostic endpoint to test email delivery from live server
 * @route   GET /api/auth/test-email
 * @access  Public
 */
export const testEmailDiagnostic = async (req, res, next) => {
  try {
    const targetEmail = req.query.to || process.env.EMAIL_USER;
    if (!targetEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide ?to=your_email@example.com in the URL query parameter.',
      });
    }

    const result = await sendTestEmailDiagnostic(targetEmail);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    next(error);
  }
};

export default {
  registerUser,
  verifyOtp,
  resendOtp,
  loginUser,
  logoutUser,
  getMe,
  forgotPassword,
  resetPassword,
  testEmailDiagnostic,
};
