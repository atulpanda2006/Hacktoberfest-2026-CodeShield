import { ApiResponse } from '../../../utils/apiResponse.js';
import { VerificationService } from '../services/verificationService.js';

/**
 * VerificationController — HTTP layer for contribution verification (Module 6).
 */
export class VerificationController {
  /**
   * POST /api/v1/verification/:contributionId
   */
  static async verifyContribution(req, res, next) {
    try {
      const result = await VerificationService.verifyContribution(
        req.params.contributionId,
        req.user
      );

      return ApiResponse.success(res, {
        message: result.verified
          ? 'Contribution verified successfully'
          : 'Verification completed with failed checks',
        data: { verification: result },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/verification/:contributionId
   */
  static async getVerification(req, res, next) {
    try {
      const verification = await VerificationService.getVerification(
        req.params.contributionId
      );

      return ApiResponse.success(res, {
        message: 'Verification details retrieved successfully',
        data: { verification },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/verification/:contributionId/evidence
   */
  static async getEvidence(req, res, next) {
    try {
      const evidence = await VerificationService.getEvidence(req.params.contributionId, {
        evidenceType: req.query.evidenceType,
      });

      return ApiResponse.success(res, {
        message: 'Contribution evidence retrieved successfully',
        data: { evidence, total: evidence.length },
      });
    } catch (error) {
      next(error);
    }
  }
}

export default VerificationController;
