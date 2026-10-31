import { ApiResponse } from '../../../utils/apiResponse.js';
import { ProfileService } from '../services/profileService.js';

/**
 * ProfileController — HTTP layer for developer profiles (Module 3).
 */
export class ProfileController {
  /**
   * POST /api/v1/profiles
   * Create the caller's developer profile.
   */
  static async createProfile(req, res, next) {
    try {
      const profile = await ProfileService.createProfile(req.user.id, req.validatedBody);

      return ApiResponse.created(res, {
        message: 'Developer profile created successfully',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/profiles/me
   * The authenticated user's profile with statistics.
   */
  static async getMyProfile(req, res, next) {
    try {
      const profile = await ProfileService.getMyProfile(req.user.id);

      return ApiResponse.success(res, {
        message: 'Profile retrieved successfully',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/profiles/:userId
   * Public profile lookup.
   */
  static async getProfile(req, res, next) {
    try {
      const profile = await ProfileService.getProfileByUserId(req.params.userId);

      return ApiResponse.success(res, {
        message: 'Profile retrieved successfully',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/profiles/me
   * Update the caller's own profile.
   */
  static async updateMyProfile(req, res, next) {
    try {
      const profile = await ProfileService.updateMyProfile(req.user.id, req.validatedBody);

      return ApiResponse.success(res, {
        message: 'Profile updated successfully',
        data: { profile },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default ProfileController;
