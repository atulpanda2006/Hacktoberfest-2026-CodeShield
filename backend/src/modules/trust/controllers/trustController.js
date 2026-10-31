import { ApiResponse } from '../../../utils/apiResponse.js';
import { TrustService } from '../services/trustService.js';

/**
 * TrustController — HTTP layer for trust relationships (Module 9).
 */
export class TrustController {
  /**
   * POST /api/v1/trust
   */
  static async createTrust(req, res, next) {
    try {
      const relationship = await TrustService.createTrust(req.user, req.validatedBody);

      return ApiResponse.created(res, {
        message: 'Trust relationship created successfully',
        data: { relationship },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/trust/me
   */
  static async getMyTrust(req, res, next) {
    try {
      const network = await TrustService.getMyTrust(req.user);

      return ApiResponse.success(res, {
        message: 'Trust network retrieved successfully',
        data: { network },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/trust/:userId
   */
  static async getTrust(req, res, next) {
    try {
      const network = await TrustService.getTrustNetwork(req.params.userId);

      return ApiResponse.success(res, {
        message: 'Trust network retrieved successfully',
        data: { network },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/trust/:relationshipId
   */
  static async updateTrust(req, res, next) {
    try {
      const relationship = await TrustService.updateTrust(
        req.params.relationshipId,
        req.user,
        req.validatedBody
      );

      return ApiResponse.success(res, {
        message: 'Trust relationship updated successfully',
        data: { relationship },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/trust/:relationshipId
   */
  static async deleteTrust(req, res, next) {
    try {
      await TrustService.deleteTrust(req.params.relationshipId, req.user);

      return ApiResponse.noContent(res);
    } catch (error) {
      next(error);
    }
  }
}

export default TrustController;
