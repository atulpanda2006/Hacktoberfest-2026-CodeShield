import { Router } from 'express';
import { VerificationController } from '../controllers/verificationController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';

const router = Router();

/**
 * @route   POST /api/v1/verification/:contributionId
 * @desc    Verify a contribution against the live GitHub API and store evidence
 * @access  Private (contributor, repository maintainer, REVIEWER/MAINTAINER/ADMIN)
 */
router.post(
  '/:contributionId',
  authenticate,
  validateUuidParams('contributionId'),
  VerificationController.verifyContribution
);

/**
 * @route   GET /api/v1/verification/:contributionId
 * @desc    Verification summary and history for a contribution
 * @access  Public
 */
router.get(
  '/:contributionId',
  validateUuidParams('contributionId'),
  VerificationController.getVerification
);

/**
 * @route   GET /api/v1/verification/:contributionId/evidence
 * @desc    Stored evidence records for a contribution
 * @access  Public
 */
router.get(
  '/:contributionId/evidence',
  validateUuidParams('contributionId'),
  VerificationController.getEvidence
);

export default router;
