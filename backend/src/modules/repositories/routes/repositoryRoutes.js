import { Router } from 'express';
import { RepositoryController } from '../controllers/repositoryController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { validateQuery } from '../../../validators/validate.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';
import {
  registerRepositorySchema,
  updateRepositorySchema,
  addMemberSchema,
  listRepositoriesSchema,
} from '../validators/repositoryValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/repositories
 * @desc    Register a GitHub repository (verified against the GitHub API)
 * @access  Private (requires a linked GitHub username; owner/collaborator or ADMIN)
 */
router.post(
  '/',
  authenticate,
  validateBody(registerRepositorySchema),
  RepositoryController.registerRepository
);

/**
 * @route   GET /api/v1/repositories
 * @desc    List registered repositories (search, language, visibility, pagination)
 * @access  Public
 */
router.get(
  '/',
  validateQuery(listRepositoriesSchema),
  RepositoryController.listRepositories
);

/**
 * @route   GET /api/v1/repositories/:id
 * @desc    Repository detail with members and counts
 * @access  Public
 */
router.get('/:id', validateUuidParams('id'), RepositoryController.getRepository);

/**
 * @route   PUT /api/v1/repositories/:id
 * @desc    Update editable repository metadata
 * @access  Private (repository OWNER or ADMIN)
 */
router.put(
  '/:id',
  authenticate,
  validateUuidParams('id'),
  validateBody(updateRepositorySchema),
  RepositoryController.updateRepository
);

/**
 * @route   DELETE /api/v1/repositories/:id
 * @desc    Delete a repository and its dependent records
 * @access  Private (repository OWNER or ADMIN)
 */
router.delete(
  '/:id',
  authenticate,
  validateUuidParams('id'),
  RepositoryController.deleteRepository
);

/**
 * @route   POST /api/v1/repositories/:id/members
 * @desc    Add or update a repository member
 * @access  Private (repository OWNER or ADMIN)
 */
router.post(
  '/:id/members',
  authenticate,
  validateUuidParams('id'),
  validateBody(addMemberSchema),
  RepositoryController.addMember
);

/**
 * @route   GET /api/v1/repositories/:id/contributions
 * @desc    Contributions submitted against a repository
 * @access  Public
 */
router.get(
  '/:id/contributions',
  validateUuidParams('id'),
  validateQuery(listRepositoriesSchema.partial()),
  RepositoryController.getContributions
);

export default router;
