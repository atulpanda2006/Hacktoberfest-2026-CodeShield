import { Router } from 'express';
import { TrustController } from '../controllers/trustController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';
import { createTrustSchema, updateTrustSchema } from '../validators/trustValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/trust
 * @desc    Endorse another developer (requires a real interaction)
 * @access  Private
 */
router.post('/', authenticate, validateBody(createTrustSchema), TrustController.createTrust);

/**
 * @route   GET /api/v1/trust/me
 * @desc    The caller's own trust network (given, received, mutual)
 * @access  Private
 */
router.get('/me', authenticate, TrustController.getMyTrust);

/**
 * @route   GET /api/v1/trust/:userId
 * @desc    A developer's public trust network
 * @access  Public
 */
router.get('/:userId', validateUuidParams('userId'), TrustController.getTrust);

/**
 * @route   PATCH /api/v1/trust/:relationshipId
 * @desc    Update one of the caller's endorsements
 * @access  Private (source developer or ADMIN)
 */
router.patch(
  '/:relationshipId',
  authenticate,
  validateUuidParams('relationshipId'),
  validateBody(updateTrustSchema),
  TrustController.updateTrust
);

/**
 * @route   DELETE /api/v1/trust/:relationshipId
 * @desc    Remove one of the caller's endorsements
 * @access  Private (source developer or ADMIN)
 */
router.delete(
  '/:relationshipId',
  authenticate,
  validateUuidParams('relationshipId'),
  TrustController.deleteTrust
);

export default router;
