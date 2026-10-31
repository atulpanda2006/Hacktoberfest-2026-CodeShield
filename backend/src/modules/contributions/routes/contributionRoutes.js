import { Router } from 'express';
import { ContributionController } from '../controllers/contributionController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { validateQuery } from '../../../validators/validate.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';
import {
  createContributionSchema,
  updateContributionStatusSchema,
  listContributionsSchema,
} from '../validators/contributionValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/contributions
 * @desc    Submit a pull request as a contribution
 * @access  Private (linked GitHub username required)
 */
router.post(
  '/',
  authenticate,
  validateBody(createContributionSchema),
  ContributionController.createContribution
);

/**
 * @route   GET /api/v1/contributions
 * @desc    List contributions with filters and pagination
 * @access  Public
 */
router.get('/', validateQuery(listContributionsSchema), ContributionController.listContributions);

/**
 * @route   GET /api/v1/contributions/me
 * @desc    The authenticated user's contributions
 * @access  Private
 */
router.get(
  '/me',
  authenticate,
  validateQuery(listContributionsSchema),
  ContributionController.listMyContributions
);

/**
 * @route   GET /api/v1/contributions/user/:userId
 * @desc    Contributions submitted by a specific developer
 * @access  Public
 */
router.get(
  '/user/:userId',
  validateUuidParams('userId'),
  validateQuery(listContributionsSchema),
  ContributionController.listUserContributions
);

/**
 * @route   GET /api/v1/contributions/repository/:repositoryId
 * @desc    Contributions submitted against a repository
 * @access  Public
 */
router.get(
  '/repository/:repositoryId',
  validateUuidParams('repositoryId'),
  validateQuery(listContributionsSchema),
  ContributionController.listRepositoryContributions
);

/**
 * @route   GET /api/v1/contributions/:id
 * @desc    Contribution detail with evidence, verification, AI and review history
 * @access  Public
 */
router.get('/:id', validateUuidParams('id'), ContributionController.getContribution);

/**
 * @route   PATCH /api/v1/contributions/:id/status
 * @desc    Move a contribution through the lifecycle state machine
 * @access  Private (contributor for queueing; maintainer/reviewer/admin for outcomes)
 */
router.patch(
  '/:id/status',
  authenticate,
  validateUuidParams('id'),
  validateBody(updateContributionStatusSchema),
  ContributionController.updateStatus
);

export default router;
