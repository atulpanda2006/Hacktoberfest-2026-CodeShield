import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController.js';
import { authenticate, authorize } from '../../../middleware/auth.js';

const router = Router();

/**
 * @route   GET /api/v1/dashboard/developer
 * @desc    Reputation, contributions, reviews, disputes and trust for the caller
 * @access  Private
 */
router.get('/developer', authenticate, DashboardController.getDeveloperDashboard);

/**
 * @route   GET /api/v1/dashboard/maintainer
 * @desc    Repositories the caller owns/maintains, review queue and open disputes
 * @access  Private (any authenticated user; empty when they maintain nothing)
 */
router.get('/maintainer', authenticate, DashboardController.getMaintainerDashboard);

/**
 * @route   GET /api/v1/dashboard/admin
 * @desc    Platform-wide counts, queues and averages
 * @access  Private (ADMIN)
 */
router.get(
  '/admin',
  authenticate,
  authorize('ADMIN'),
  DashboardController.getAdminDashboard
);

/**
 * @route   GET /api/v1/dashboard/statistics
 * @desc    Public aggregate statistics
 * @access  Public
 */
router.get('/statistics', DashboardController.getStatistics);

export default router;
