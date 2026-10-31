import { Router } from 'express';
import { AIController } from '../controllers/aiController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';

const router = Router();

/**
 * @route   POST /api/v1/ai/analyze/:contributionId
 * @desc    Send a verified contribution to the independent AI service and store the analysis
 * @access  Private (contributor, repository maintainer, REVIEWER/MAINTAINER/ADMIN)
 */
router.post(
  '/analyze/:contributionId',
  authenticate,
  validateUuidParams('contributionId'),
  AIController.analyzeContribution
);

/**
 * @route   GET /api/v1/ai/results/:contributionId
 * @desc    AI analysis history and summary for a contribution
 * @access  Public
 */
router.get(
  '/results/:contributionId',
  validateUuidParams('contributionId'),
  AIController.getResults
);

export default router;
