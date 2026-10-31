import { ApiResponse } from '../../../utils/apiResponse.js';
import { DisputeService } from '../services/disputeService.js';

/**
 * DisputeController — HTTP layer for disputes (Module 11).
 */
export class DisputeController {
  /**
   * POST /api/v1/disputes
   */
  static async createDispute(req, res, next) {
    try {
      const dispute = await DisputeService.createDispute(req.user, req.validatedBody);

      return ApiResponse.created(res, {
        message: 'Dispute filed successfully',
        data: { dispute },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/disputes/me
   */
  static async getMyDisputes(req, res, next) {
    try {
      const { items, total, page, limit } = await DisputeService.getMyDisputes(
        req.user,
        req.validatedQuery ?? req.query
      );

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Your disputes retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/disputes/contribution/:contributionId
   */
  static async getContributionDisputes(req, res, next) {
    try {
      const { items, total, page, limit } = await DisputeService.getDisputesForContribution(
        req.params.contributionId,
        req.validatedQuery ?? req.query
      );

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Contribution disputes retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/disputes/:id
   */
  static async getDispute(req, res, next) {
    try {
      const dispute = await DisputeService.getDisputeById(req.params.id);

      return ApiResponse.success(res, {
        message: 'Dispute retrieved successfully',
        data: { dispute },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/disputes/:id/status
   */
  static async updateStatus(req, res, next) {
    try {
      const dispute = await DisputeService.updateStatus(
        req.params.id,
        req.user,
        req.validatedBody
      );

      return ApiResponse.success(res, {
        message: 'Dispute status updated successfully',
        data: { dispute },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default DisputeController;
