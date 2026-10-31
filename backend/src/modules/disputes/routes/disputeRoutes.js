import { Router } from 'express';
import { DisputeController } from '../controllers/disputeController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { validateQuery } from '../../../validators/validate.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';
import {
  createDisputeSchema,
  updateDisputeStatusSchema,
  listDisputesSchema,
} from '../validators/disputeValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/disputes
 * @desc    Report a suspicious contribution
 * @access  Private (the contributor cannot dispute their own contribution)
 */
router.post('/', authenticate, validateBody(createDisputeSchema), DisputeController.createDispute);

/**
 * @route   GET /api/v1/disputes/me
 * @desc    Disputes filed or resolved by the authenticated user
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  validateQuery(listDisputesSchema),
  DisputeController.getMyDisputes
);

/**
 * @route   GET /api/v1/disputes/contribution/:contributionId
 * @desc    Disputes filed against a contribution
 * @access  Public
 */
router.get(
  '/contribution/:contributionId',
  validateUuidParams('contributionId'),
  validateQuery(listDisputesSchema),
  DisputeController.getContributionDisputes
);

/**
 * @route   GET /api/v1/disputes/:id
 * @desc    Dispute detail
 * @access  Public
 */
router.get('/:id', validateUuidParams('id'), DisputeController.getDispute);

/**
 * @route   PATCH /api/v1/disputes/:id/status
 * @desc    Triage, resolve, dismiss, or appeal a dispute
 * @access  Private (reviewers/admins decide; involved parties may appeal)
 */
router.patch(
  '/:id/status',
  authenticate,
  validateUuidParams('id'),
  validateBody(updateDisputeStatusSchema),
  DisputeController.updateStatus
);

export default router;
