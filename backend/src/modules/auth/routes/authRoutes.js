import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { authenticate } from '../../../middleware/auth.js';
import {
  validateBody,
  registerSchema,
  loginSchema,
} from '../validators/authValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post(
  '/register',
  validateBody(registerSchema),
  AuthController.register
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user and return JWT
 * @access  Public
 */
router.post(
  '/login',
  validateBody(loginSchema),
  AuthController.login
);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user
 * @access  Private (requires valid JWT)
 */
router.get('/me', authenticate, AuthController.me);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current user (client discards token)
 * @access  Private (requires valid JWT)
 */
router.post('/logout', authenticate, AuthController.logout);

export default router;
