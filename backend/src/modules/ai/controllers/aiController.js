import { ApiResponse } from '../../../utils/apiResponse.js';
import { AIService } from '../services/aiService.js';

/**
 * AIController — HTTP layer for AI analysis (Module 7).
 */
export class AIController {
  /**
   * POST /api/v1/ai/analyze/:contributionId
   */
  static async analyzeContribution(req, res, next) {
    try {
      const analysis = await AIService.analyzeContribution(
        req.params.contributionId,
        req.user
      );

      return ApiResponse.success(res, {
        message: 'AI analysis completed and stored',
        data: { analysis },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/ai/results/:contributionId
   */
  static async getResults(req, res, next) {
    try {
      const results = await AIService.getResults(req.params.contributionId);

      return ApiResponse.success(res, {
        message: 'AI analysis results retrieved successfully',
        data: results,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default AIController;
