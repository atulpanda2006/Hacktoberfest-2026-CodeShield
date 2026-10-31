import { Router } from 'express';
import { getPrismaClient } from '../config/database.js';
import { ApiResponse } from '../utils/apiResponse.js';

const router = Router();

/**
 * @route   GET /api/v1/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/', async (req, res, next) => {
  try {
    const prisma = getPrismaClient();

    // Test database connectivity
    await prisma.$queryRaw`SELECT 1`;

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      version: '1.0.0',
    };

    return ApiResponse.success(res, {
      message: 'Server is running',
      data: healthData,
    });
  } catch (error) {
    const healthData = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: 'disconnected',
      version: '1.0.0',
    };

    return ApiResponse.error(res, {
      statusCode: 503,
      message: 'Server is unhealthy',
      errors: [healthData],
    });
  }
});

export default router;
