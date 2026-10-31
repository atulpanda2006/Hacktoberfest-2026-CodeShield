import { Router } from 'express';

import { GitHubController } from '../controllers/githubController.js';
import { connectTokenSchema } from '../validators/githubValidator.js';
import { authenticate } from '../../../middleware/auth.js';
import { validateBody } from '../../auth/validators/authValidator.js';

const router = Router();

/**
 * @route   GET /api/v1/github/connection
 * @desc    The authenticated user's GitHub connection status
 * @access  Private
 */
router.get('/connection', authenticate, GitHubController.getStatus);

/**
 * @route   POST /api/v1/github/connection
 * @desc    Connect or rotate the caller's own GitHub personal access token
 * @access  Private
 */
router.post(
  '/connection',
  authenticate,
  validateBody(connectTokenSchema),
  GitHubController.connectWithToken
);

/**
 * @route   DELETE /api/v1/github/connection
 * @desc    Remove the caller's stored GitHub credentials
 * @access  Private
 */
router.delete('/connection', authenticate, GitHubController.disconnect);

/**
 * @route   GET /api/v1/github/oauth/start
 * @desc    GitHub OAuth authorization URL (only when OAuth is configured)
 * @access  Private
 */
router.get('/oauth/start', authenticate, GitHubController.startOAuth);

/**
 * @route   GET /api/v1/github/oauth/callback
 * @desc    GitHub OAuth callback
 * @access  Public (state token is signed and short-lived)
 */
router.get('/oauth/callback', GitHubController.oauthCallback);

export default router;
