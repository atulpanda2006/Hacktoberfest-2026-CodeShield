import { ApiResponse } from '../../../utils/apiResponse.js';
import { ContributionService } from '../services/contributionService.js';

/**
 * ContributionController — HTTP layer for contributions (Module 5).
 */
export class ContributionController {
  /**
   * POST /api/v1/contributions
   */
  static async createContribution(req, res, next) {
    try {
      const contribution = await ContributionService.createContribution(
        req.user,
        req.validatedBody
      );

      return ApiResponse.created(res, {
        message: 'Contribution submitted successfully',
        data: { contribution },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/contributions
   */
  static async listContributions(req, res, next) {
    try {
      const query = req.validatedQuery ?? req.query;
      const { items, total, page, limit } = await ContributionService.listContributions(query);

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Contributions retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/contributions/me
   */
  static async listMyContributions(req, res, next) {
    try {
      const query = req.validatedQuery ?? req.query;
      const { items, total, page, limit } = await ContributionService.listContributions(query, {
        contributorId: req.user.id,
      });

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Your contributions retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/contributions/user/:userId
   */
  static async listUserContributions(req, res, next) {
    try {
      const query = req.validatedQuery ?? req.query;
      const { items, total, page, limit } = await ContributionService.listByContributor(
        req.params.userId,
        query
      );

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'User contributions retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/contributions/repository/:repositoryId
   */
  static async listRepositoryContributions(req, res, next) {
    try {
      const query = req.validatedQuery ?? req.query;
      const { items, total, page, limit } = await ContributionService.listByRepository(
        req.params.repositoryId,
        query
      );

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Repository contributions retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/contributions/:id
   */
  static async getContribution(req, res, next) {
    try {
      const contribution = await ContributionService.getContributionById(req.params.id);

      return ApiResponse.success(res, {
        message: 'Contribution retrieved successfully',
        data: { contribution },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/contributions/:id/status
   */
  static async updateStatus(req, res, next) {
    try {
      const contribution = await ContributionService.updateStatus(
        req.params.id,
        req.user,
        req.validatedBody
      );

      return ApiResponse.success(res, {
        message: 'Contribution status updated successfully',
        data: { contribution },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default ContributionController;
