import { ApiResponse } from '../../../utils/apiResponse.js';
import { AuthService } from '../../auth/services/authService.js';

/**
 * UserController — Handles HTTP requests and responses for user management.
 * Delegates business logic to AuthService.
 */

export class UserController {
  /**
   * GET /api/v1/users/:id
   * Get a user by ID (public endpoint, excludes password hash).
   */
  static async getUserById(req, res, next) {
    try {
      const { id } = req.params;

      const user = await AuthService.getUserById(id);

      return ApiResponse.success(res, {
        message: 'User retrieved successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/users/:id
   * Update a user's profile. Owner or ADMIN only.
   */
  static async updateUser(req, res, next) {
    try {
      const { id } = req.params;
      const { validatedBody } = req;
      const requestingUserId = req.user.id;
      const requestingUserRole = req.user.role;

      const updatedUser = await AuthService.updateUser(
        id,
        validatedBody,
        requestingUserId,
        requestingUserRole
      );

      return ApiResponse.success(res, {
        message: 'User updated successfully',
        data: { user: updatedUser },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default UserController;
