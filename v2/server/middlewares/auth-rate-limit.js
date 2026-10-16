const { rateLimit } = require('express-rate-limit');

// Apply to login POST handlers; this is separate from the general request limiter.
const loginAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, _res, next) {
    const error = new Error('Too many sign-in attempts. Try again later.');
    error.code = 'AUTH_RATE_LIMITED';
    next(error);
  },
});

module.exports = { loginAttemptLimiter };
