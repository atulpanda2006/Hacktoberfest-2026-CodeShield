import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';

export const globalLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    ApiResponse.error(res, {
      statusCode: 429,
      message: 'Too many requests, please try again later',
    });
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    ApiResponse.error(res, {
      statusCode: 429,
      message: 'Too many authentication attempts, please try again later',
    });
  },
});
