import { Router } from 'express';
import { VouchController } from '../controllers/vouchController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { vouchAddSchema, vouchCheckSchema, vouchRemoveSchema } from '../validators/vouchValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/vouch/check
 * @desc    Check if a user is vouched, denounced, or unknown
 * @access  Private (requires JWT)
 */
router.post(
  '/check',
  authenticate,
  validateBody(vouchCheckSchema),
  VouchController.checkVouch
);

/**
 * @route   POST /api/v1/vouch/add
 * @desc    Add a vouch for a user
 * @access  Private (requires JWT)
 */
router.post(
  '/add',
  authenticate,
  validateBody(vouchAddSchema),
  VouchController.addVouch
);

/**
 * @route   POST /api/v1/vouch/remove
 * @desc    Denounce or remove a user from the vouch list
 * @access  Private (requires JWT)
 */
router.post(
  '/remove',
  authenticate,
  validateBody(vouchRemoveSchema),
  VouchController.removeVouch
);

export default router;