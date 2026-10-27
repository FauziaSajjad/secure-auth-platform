const rateLimit = require('express-rate-limit');
const config = require('../config');

// Tests skip limiting unless a test opts in with TEST_RATE_LIMIT=1.
const skip = () => config.isTest && process.env.TEST_RATE_LIMIT !== '1';

const base = { standardHeaders: 'draft-7', legacyHeaders: false, skip };

const globalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 300,
  message: { error: 'Too many requests. Please slow down.' },
});

const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

module.exports = { globalLimiter, authLimiter };
