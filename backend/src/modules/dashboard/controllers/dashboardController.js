import { ApiResponse } from '../../../utils/apiResponse.js';
import { DashboardService } from '../services/dashboardService.js';

/**
 * DashboardController — HTTP layer for dashboards (Module 12).
 */
export class DashboardController {
  /**
   * GET /api/v1/dashboard/developer
   */
  static async getDeveloperDashboard(req, res, next) {
    try {
      const dashboard = await DashboardService.getDeveloperDashboard(req.user);

      return ApiResponse.success(res, {
        message: 'Developer dashboard retrieved successfully',
        data: { dashboard },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/maintainer
   */
  static async getMaintainerDashboard(req, res, next) {
    try {
      const dashboard = await DashboardService.getMaintainerDashboard(req.user);

      return ApiResponse.success(res, {
        message: 'Maintainer dashboard retrieved successfully',
        data: { dashboard },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/admin
   */
  static async getAdminDashboard(req, res, next) {
    try {
      const dashboard = await DashboardService.getAdminDashboard(req.user);

      return ApiResponse.success(res, {
        message: 'Admin dashboard retrieved successfully',
        data: { dashboard },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/dashboard/statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const statistics = await DashboardService.getStatistics();

      return ApiResponse.success(res, {
        message: 'Platform statistics retrieved successfully',
        data: { statistics },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default DashboardController;
