import { ApiResponse } from '../../../utils/apiResponse.js';
import { AuthService } from '../services/authService.js';

/**
 * AuthController — Handles HTTP requests and responses for authentication.
 * Delegates business logic to AuthService. Does not contain business logic itself.
 */

export class AuthController {
  /**
   * POST /api/v1/auth/register
   * Register a new user.
   */
  static async register(req, res, next) {
    try {
      const { user, token } = await AuthService.register(req.validatedBody);

      return ApiResponse.created(res, {
        message: 'User registered successfully',
        data: {
          user,
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/login
   * Authenticate a user and return a JWT.
   */
  static async login(req, res, next) {
    try {
      const { user, token } = await AuthService.login(req.validatedBody);

      return ApiResponse.success(res, {
        message: 'Login successful',
        data: {
          user,
          token,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   * Get the currently authenticated user's profile.
   */
  static async me(req, res, next) {
    try {
      // req.user is attached by the authenticate middleware
      const user = await AuthService.getCurrentUser(req.user.id);

      return ApiResponse.success(res, {
        message: 'User profile retrieved successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Logout the current user (client discards token).
   */
  static async logout(req, res, next) {
    try {
      await AuthService.logout();

      return ApiResponse.success(res, {
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export default AuthController;
