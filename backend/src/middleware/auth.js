import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getPrismaClient } from '../config/database.js';

/**
 * Authentication middleware — verifies JWT and attaches user to request.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error(res, {
        statusCode: 401,
        message: 'Access denied. No token provided.',
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, env.jwt.secret);

    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        accountStatus: true,
      },
    });

    if (!user) {
      return ApiResponse.error(res, {
        statusCode: 401,
        message: 'Invalid token. User not found.',
      });
    }

    if (user.accountStatus !== 'ACTIVE') {
      return ApiResponse.error(res, {
        statusCode: 403,
        message: 'Account is not active.',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return ApiResponse.error(res, { statusCode: 401, message: 'Token expired.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return ApiResponse.error(res, { statusCode: 401, message: 'Invalid token.' });
    }
    next(error);
  }
}

/**
 * Authorization middleware — checks if user has one of the required roles.
 * @param  {...string} roles - Allowed roles
 */
export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, {
        statusCode: 401,
        message: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return ApiResponse.error(res, {
        statusCode: 403,
        message: 'Insufficient permissions.',
      });
    }

    next();
  };
}

