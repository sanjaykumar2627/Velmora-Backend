import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'velmora_token';

/**
 * Generate JWT token and set secure HTTP-only cookie
 * @param {Object} res - Express response object
 * @param {string} userId - User MongoDB ObjectId
 * @param {string} role - User role ('customer' | 'admin')
 * @returns {string} token
 */
export const generateTokenAndSetCookie = (res, userId, role = 'customer') => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment variables');
  }

  // Token expires in 7 days
  const token = jwt.sign({ id: userId, role }, secret, {
    expiresIn: '7d',
  });

  const isProduction = process.env.NODE_ENV === 'production';

  // Secure cookie configuration:
  // - httpOnly: blocks client-side JS XSS access
  // - secure: required when sameSite is 'none', true in production
  // - sameSite: 'none' in production for cross-site (Render <-> Vercel)
  // - maxAge: 7 days in milliseconds
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };

  res.cookie(COOKIE_NAME, token, cookieOptions);

  return token;
};

/**
 * Clear authentication cookie
 * @param {Object} res - Express response object
 */
export const clearAuthCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  };

  res.clearCookie(COOKIE_NAME, cookieOptions);
  // Explicit expire fallback for cross-browser reliability (Safari / Chrome / Mobile)
  res.cookie(COOKIE_NAME, '', {
    ...cookieOptions,
    expires: new Date(0),
    maxAge: 0,
  });
};

export default {
  generateTokenAndSetCookie,
  clearAuthCookie,
};
