import crypto from 'crypto';
import User from '../models/userModel.js';
import { generateTokenAndSetCookie, clearAuthCookie } from '../utils/generateToken.js';
import { validateRegistration, validateLogin } from '../utils/validators.js';
import { sendOtpEmail, sendWelcomeEmail, sendPasswordResetEmail, sendTestEmailDiagnostic } from '../services/emailService.js';
import { customerAccessTokenCreate, customerCreate } from '../services/shopifyService.js';

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

    // 2. Check if user already exists
    let user = await User.findOne({ email: normalizedEmail });
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.',
      });
    }

    user = new User({
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      phoneNumber: effectivePhone.trim(),
      isVerified: true,
    });

    await user.save();

    // Auto-create & link customer in Shopify Storefront
    try {
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || firstName;
      const shopifyCustomer = await customerCreate({
        email: normalizedEmail,
        password,
        firstName,
        lastName,
      });
      if (shopifyCustomer?.customer?.id) {
        user.shopifyCustomerId = shopifyCustomer.customer.id;
      }
      const authRes = await customerAccessTokenCreate(normalizedEmail, password);
      if (authRes?.customerAccessToken?.accessToken) {
        user.shopifyCustomerAccessToken = authRes.customerAccessToken.accessToken;
      }
      if (user.shopifyCustomerId || user.shopifyCustomerAccessToken) {
        await user.save({ validateBeforeSave: false });
      }
    } catch (shopifySyncErr) {
      console.warn('[Shopify Customer Sync Warning]', shopifySyncErr.message);
    }

    // Dispatch welcome email asynchronously in background
    sendWelcomeEmail({
      to: user.email,
      fullName: user.fullName,
    }).catch((err) => {
      console.warn('[Email Service Notice] Welcome email failed:', err.message);
    });

    // Generate JWT & set HTTP-only cookie for instant login
    const token = generateTokenAndSetCookie(res, user._id, user.role);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to Velmora.',
      user: user.toJSON(),
      token,
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
    const user = await User.findOne({ email: normalizedEmail }).select(
      '+otp +otpExpire +shopifyCustomerAccessToken'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No registration found for this email address. Please sign up.',
      });
    }

    if (user.isVerified) {
      const token = generateTokenAndSetCookie(res, user._id, user.role);
      return res.status(200).json({
        success: true,
        message: 'Your account is already verified. Logged in successfully.',
        user: user.toJSON(),
        token,
      });
    }

    if (!user.otp || user.otp !== otp.toString().trim()) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect verification code. Please check your Gmail and try again.',
      });
    }

    if (user.otpExpire && user.otpExpire < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired (10 minutes limit). Please request a new code.',
      });
    }

    // Mark as verified
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpire = undefined;
    await user.save();

    // Dispatch welcome email asynchronously
    sendWelcomeEmail({ to: user.email, fullName: user.fullName }).catch((err) =>
      console.warn('[Welcome Email Notice]', err.message)
    );

    // Generate JWT & set HTTP-only cookie
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
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address.',
      });
    }

    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'This account is already verified. Please sign in directly.',
      });
    }

    const otp = user.generateOTP();
    await user.save();

    sendOtpEmail({
      to: user.email,
      fullName: user.fullName,
      otp,
    }).catch((err) => {
      console.error(`[Email Service Error] Failed to resend OTP to ${user.email}:`, err.message);
    });

    return res.status(200).json({
      success: true,
      message: 'A fresh 6-digit verification code has been dispatched to your Gmail.',
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

    // 2. Find user including password
    const user = await User.findOne({ email: normalizedEmail }).select(
      '+password +shopifyCustomerAccessToken'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password. Please check your credentials.',
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

    // Auto-verify user on successful password match if needed
    if (!user.isVerified) {
      user.isVerified = true;
      await user.save({ validateBeforeSave: false });
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
