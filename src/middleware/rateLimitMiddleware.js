import rateLimit from 'express-rate-limit';

/**
 * Sensitive authentication endpoints (register, login, OTP)
 * In development / local testing: completely bypassed (no lockouts)
 * In production: relaxed limit (100 attempts per 15 mins)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 2000,
  skip: (req) => {
    // Disable rate limiting in development or on localhost
    if (process.env.NODE_ENV !== 'production') return true;
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip.includes('127.0.0.1');
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Please try again after a few minutes.',
  },
});

/**
 * General API limiter
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000,
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please slow down and try again later.',
  },
});

export default { authLimiter, apiLimiter };
