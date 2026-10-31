import { Router } from 'express';
import { ProfileController } from '../controllers/profileController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';
import { createProfileSchema, updateProfileSchema } from '../validators/profileValidator.js';
import { validateUuidParams } from '../../../middleware/validateParams.js';

const router = Router();

/**
 * @route   POST /api/v1/profiles
 * @desc    Create the authenticated user's developer profile
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  validateBody(createProfileSchema),
  ProfileController.createProfile
);

/**
 * @route   GET /api/v1/profiles/me
 * @desc    Get the authenticated user's profile and statistics
 * @access  Private
 */
router.get('/me', authenticate, ProfileController.getMyProfile);

/**
 * @route   PUT /api/v1/profiles/me
 * @desc    Update the authenticated user's profile
 * @access  Private
 */
router.put(
  '/me',
  authenticate,
  validateBody(updateProfileSchema),
  ProfileController.updateMyProfile
);

/**
 * @route   GET /api/v1/profiles/:userId
 * @desc    Get a developer's public profile and statistics
 * @access  Public
 */
router.get('/:userId', validateUuidParams('userId'), ProfileController.getProfile);

export default router;
