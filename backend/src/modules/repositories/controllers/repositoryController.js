import { ApiResponse } from '../../../utils/apiResponse.js';
import { buildPaginationMeta } from '../../../utils/pagination.js';
import { RepositoryService } from '../services/repositoryService.js';

/**
 * RepositoryController — HTTP layer for repository management (Module 4).
 */
export class RepositoryController {
  /**
   * POST /api/v1/repositories
   */
  static async registerRepository(req, res, next) {
    try {
      const repository = await RepositoryService.registerRepository(req.user, req.validatedBody);

      return ApiResponse.created(res, {
        message: 'Repository registered successfully',
        data: { repository },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/repositories
   */
  static async listRepositories(req, res, next) {
    try {
      const query = req.validatedQuery ?? req.query;
      const { items, total, page, limit } = await RepositoryService.listRepositories(query);

      return ApiResponse.paginated(res, {
        data: items,
        page,
        limit,
        total,
        message: 'Repositories retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/repositories/:id
   */
  static async getRepository(req, res, next) {
    try {
      const repository = await RepositoryService.getRepositoryById(req.params.id);

      return ApiResponse.success(res, {
        message: 'Repository retrieved successfully',
        data: { repository },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/repositories/:id
   */
  static async updateRepository(req, res, next) {
    try {
      const repository = await RepositoryService.updateRepository(
        req.params.id,
        req.user,
        req.validatedBody
      );

      return ApiResponse.success(res, {
        message: 'Repository updated successfully',
        data: { repository },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/repositories/:id
   */
  static async deleteRepository(req, res, next) {
    try {
      await RepositoryService.deleteRepository(req.params.id, req.user);

      return ApiResponse.noContent(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/repositories/:id/members
   */
  static async addMember(req, res, next) {
    try {
      const member = await RepositoryService.addMember(
        req.params.id,
        req.user,
        req.validatedBody
      );

      return ApiResponse.success(res, {
        message: 'Repository member saved successfully',
        data: { member },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/repositories/:id/contributions
   */
  static async getContributions(req, res, next) {
    try {
      const query = req.validatedQuery ?? req.query;
      const { items, total, page, limit } = await RepositoryService.getRepositoryContributions(
        req.params.id,
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
}

export default RepositoryController;
