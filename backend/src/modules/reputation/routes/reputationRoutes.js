import { Router } from 'express';
import { z } from 'zod';

import { ReputationController } from '../controllers/reputationController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { validateQuery } from '../../../validators/validate.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';
import { AppError } from '../../../utils/AppError.js';

const router = Router();

const recalculateSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
  force: z.boolean().optional(),
});

const historySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * A user may recalculate their own reputation; administrators may recalculate
 * anyone's. Recalculation is idempotent, so this is safe to call repeatedly.
 */
function ensureSelfOrAdmin(req, res, next) {
  if (req.user.role === 'ADMIN' || req.user.id === req.params.userId) {
    return next();
  }
  return next(AppError.forbidden('You can only recalculate your own reputation'));
}

/**
 * @route   GET /api/v1/reputation/me
 * @desc    The authenticated user's current reputation
 * @access  Private
 */
router.get('/me', authenticate, ReputationController.getMyReputation);

/**
 * @route   POST /api/v1/reputation/recalculate/:userId
 * @desc    Recalculate and persist a reputation (self or ADMIN, idempotent)
 * @access  Private
 */
router.post(
  '/recalculate/:userId',
  authenticate,
  validateUuidParams('userId'),
  validateBody(recalculateSchema),
  ensureSelfOrAdmin,
  ReputationController.recalculate
);

/**
 * @route   GET /api/v1/reputation/:userId/history
 * @desc    Auditable history of score changes
 * @access  Public
 */
router.get(
  '/:userId/history',
  validateUuidParams('userId'),
  validateQuery(historySchema),
  ReputationController.getHistory
);

/**
 * @route   GET /api/v1/reputation/:userId/breakdown
 * @desc    Score breakdown with weights and component explanations
 * @access  Public
 */
router.get(
  '/:userId/breakdown',
  validateUuidParams('userId'),
  ReputationController.getBreakdown
);

/**
 * @route   GET /api/v1/reputation/:userId
 * @desc    Current reputation for any developer
 * @access  Public
 */
router.get('/:userId', validateUuidParams('userId'), ReputationController.getReputation);

export default router;
