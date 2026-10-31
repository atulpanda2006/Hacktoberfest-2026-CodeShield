import { ApiResponse } from '../../../utils/apiResponse.js';
import { ReviewService } from '../services/reviewService.js';

/**
 * ReviewController — HTTP layer for community reviews (Module 10).
 */
export class ReviewController {
  /**
   * POST /api/v1/reviews
   */
  static async createReview(req, res, next) {
    try {
      const review = await ReviewService.createReview(req.user, req.validatedBody);

      return ApiResponse.created(res, {
        message: 'Review submitted successfully',
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/reviews/contribution/:contributionId
   */
  static async getContributionReviews(req, res, next) {
    try {
      const { items, total, page, limit, summary } = await ReviewService.getContributionReviews(
        req.params.contributionId,
        req.validatedQuery ?? req.query
      );

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Contribution reviews retrieved successfully',
        summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/reviews/me
   */
  static async getMyReviews(req, res, next) {
    try {
      const { items, total, page, limit } = await ReviewService.getMyReviews(
        req.user,
        req.validatedQuery ?? req.query
      );

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Your reviews retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/reviews/:reviewId
   */
  static async updateReview(req, res, next) {
    try {
      const review = await ReviewService.updateReview(
        req.params.reviewId,
        req.user,
        req.validatedBody
      );

      return ApiResponse.success(res, {
        message: 'Review updated successfully',
        data: { review },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default ReviewController;
