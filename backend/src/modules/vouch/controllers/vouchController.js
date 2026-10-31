import { ApiResponse } from '../../../utils/apiResponse.js';
import { checkVouchStatus, addVouch, denounceUser, persistVouchRecords } from '../services/vouchService.js';

/**
 * VouchController — HTTP layer for vouch list management (Module: Vouch).
 * Delegates business logic to VouchService.
 */

export class VouchController {
  /** POST /api/v1/vouch/check — Check if a user is vouched, denounced, or unknown */
  static async checkVouch(req, res, next) {
    try {
      const { username } = req.body;
      if (!username) {
        return next(AppError.badRequest('Username is required'));
      }
      const result = checkVouchStatus(username);
      return ApiResponse.success(res, {
        message: 'Vouch status checked',
        data: { status: result.status, reason: result.reason },
      });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/vouch/add — Add a vouch for a user */
  static async addVouch(req, res, next) {
    try {
      const { username, reason } = req.body;
      if (!username) {
        return next(AppError.badRequest('Username is required'));
      }
      const result = addVouch(username, reason);
      persistVouchRecords();
      return ApiResponse.success(res, {
        message: result.status === 'added' ? 'Vouch added successfully' : 'User already vouched',
        data: { status: result.status, username },
      });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/vouch/remove — Remove/denounce a user from the vouch list */
  static async removeVouch(req, res, next) {
    try {
      const { username, reason } = req.body;
      if (!username) {
        return next(AppError.badRequest('Username is required'));
      }
      const result = denounceUser(username, reason);
      persistVouchRecords();
      return ApiResponse.success(res, {
        message: result.status === 'removed' ? 'User denounced/removed' : 'User was not vouched',
        data: { status: result.status, username },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default VouchController;