import { ApiResponse } from '../../../utils/apiResponse.js';
import { GitHubAccountService } from '../services/githubAccountService.js';

/**
 * GitHubController — per-user GitHub connection endpoints (Module 14).
 * The GitHub token is never included in any response.
 */
export class GitHubController {
  /**
   * GET /api/v1/github/connection
   * Connection status for the authenticated user.
   */
  static async getStatus(req, res, next) {
    try {
      const status = await GitHubAccountService.getStatus(req.user.id);

      res.set('Cache-Control', 'no-store');

      return ApiResponse.success(res, {
        message: status.connected
          ? 'GitHub connection retrieved successfully'
          : 'No GitHub account is connected',
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/github/connection
   * Connect or rotate the caller's personal access token.
   */
  static async connectWithToken(req, res, next) {
    try {
      const { token } = req.validatedBody;
      const result = await GitHubAccountService.connectWithToken(req.user.id, token);

      return ApiResponse.success(res, {
        message: `GitHub account @${result.account.githubUsername} connected successfully`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/github/connection
   */
  static async disconnect(req, res, next) {
    try {
      const result = await GitHubAccountService.disconnect(req.user.id);

      return ApiResponse.success(res, {
        message: `GitHub account @${result.githubUsername} disconnected`,
        data: { connected: false },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/github/oauth/start
   * Returns the GitHub authorization URL (when OAuth is configured).
   */
  static async startOAuth(req, res, next) {
    try {
      const result = GitHubAccountService.buildOAuthUrl(req.user.id);

      return ApiResponse.success(res, {
        message: 'GitHub authorization URL generated',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/github/oauth/callback
   * Public callback: GitHub redirects the browser here.
   */
  static async oauthCallback(req, res) {
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';

    try {
      const result = await GitHubAccountService.handleOAuthCallback(
        req.query.code,
        req.query.state
      );

      return res.redirect(
        302,
        `${frontendBase}/profile?github=connected&username=${encodeURIComponent(
          result.account.githubUsername
        )}`
      );
    } catch (error) {
      const message = error?.message || 'GitHub authorization failed';

      return res.redirect(
        302,
        `${frontendBase}/profile?github=error&reason=${encodeURIComponent(message)}`
      );
    }
  }
}

export default GitHubController;
