import { Router } from 'express';
import { UserController } from '../controllers/userController.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody, updateUserSchema } from '../../auth/validators/authValidator.js';

const router = Router();

/**
 * @route   GET /api/v1/users/:id
 * @desc    Get a user by ID
 * @access  Public
 */
router.get('/:id', UserController.getUserById);

/**
 * @route   PUT /api/v1/users/:id
 * @desc    Update a user's profile (owner or ADMIN only)
 * @access  Private (requires valid JWT + ownership or ADMIN role)
 */
router.put(
  '/:id',
  authenticate,
  validateBody(updateUserSchema),
  UserController.updateUser
);

export default router;
