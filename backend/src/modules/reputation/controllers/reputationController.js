import { ApiResponse } from '../../../utils/apiResponse.js';
import { ReputationService } from '../services/reputationService.js';

/**
 * ReputationController — HTTP layer for the trust & reputation engine (Module 8).
 */
export class ReputationController {
  /**
   * GET /api/v1/reputation/me
   */
  static async getMyReputation(req, res, next) {
    try {
      const reputation = await ReputationService.getReputation(req.user.id);

      return ApiResponse.success(res, {
        message: 'Reputation retrieved successfully',
        data: { reputation },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/reputation/:userId
   */
  static async getReputation(req, res, next) {
    try {
      const reputation = await ReputationService.getReputation(req.params.userId);

      return ApiResponse.success(res, {
        message: 'Reputation retrieved successfully',
        data: { reputation },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/reputation/:userId/history
   */
  static async getHistory(req, res, next) {
    try {
      const { items, total, page, limit } = await ReputationService.getHistory(
        req.params.userId,
        req.validatedQuery ?? req.query
      );

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Reputation history retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/reputation/:userId/breakdown
   */
  static async getBreakdown(req, res, next) {
    try {
      const breakdown = await ReputationService.getBreakdown(req.params.userId);

      return ApiResponse.success(res, {
        message: 'Reputation breakdown retrieved successfully',
        data: { breakdown },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/reputation/recalculate/:userId
   * Idempotent: repeating it without new evidence writes no history.
   */
  static async recalculate(req, res, next) {
    try {
      const result = await ReputationService.recalculateForUser(req.params.userId, {
        reason: req.validatedBody?.reason ?? 'Manual reputation recalculation',
        sourceType: 'MANUAL_RECALCULATION',
        force: req.validatedBody?.force ?? false,
      });

      return ApiResponse.success(res, {
        message: result.changed
          ? 'Reputation recalculated successfully'
          : 'No new evidence; reputation unchanged',
        data: { result },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default ReputationController;
