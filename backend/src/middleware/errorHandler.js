import logger from '../utils/logger.js';
import { ApiResponse } from '../utils/apiResponse.js';
import env from '../config/env.js';

/**
 * Global error handling middleware.
 * Catches all errors and returns a consistent JSON response.
 */
export function errorHandler(err, req, res, _next) {
  // Log the error
  logger.error(`${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // Prisma known request error
  if (err.code === 'P2002') {
    return ApiResponse.error(res, {
      statusCode: 409,
      message: 'A record with this value already exists',
      errors: [{ field: err.meta?.target, message: 'Duplicate value' }],
    });
  }

  if (err.code === 'P2025') {
    return ApiResponse.error(res, {
      statusCode: 404,
      message: 'Record not found',
    });
  }

  // Zod validation error (supports Zod v3 and v4)
  if (err.name === 'ZodError') {
    const issues = err.issues || err.errors || [];
    const validationErrors = issues.map((e) => ({
      field: e.path ? e.path.join('.') : (e.path?.join('.') || 'unknown'),
      message: e.message || e.msg || 'Validation error',
    }));

    return ApiResponse.error(res, {
      statusCode: 400,
      message: 'Validation failed',
      errors: validationErrors,
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiResponse.error(res, {
      statusCode: 401,
      message: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return ApiResponse.error(res, {
      statusCode: 401,
      message: 'Token expired',
    });
  }

  // Operational errors (AppError instances)
  if (err.isOperational) {
    return ApiResponse.error(res, {
      statusCode: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
  }

  // Unexpected errors - don't leak details in production
  const statusCode = err.statusCode || 500;
  const message = env.isProduction()
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';

  return ApiResponse.error(res, {
    statusCode,
    message,
  });
}

/**
 * 404 Not Found middleware.
 * Handles requests to undefined routes.
 */
export function notFoundHandler(req, res) {
  return ApiResponse.error(res, {
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}
