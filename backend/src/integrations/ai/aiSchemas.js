import { z } from 'zod';

/**
 * Validation for AI analysis responses (Module 7).
 *
 * These mirrors the agreed integration contract. Scores are bounded so a
 * malformed model response can never write an out-of-range reputation input.
 * This is the contract to finalise with the AI developer; keeping it in one file
 * means a contract change is a one-file change.
 */

const scoreSchema = z
  .number({ message: 'score must be a number' })
  .min(0, 'score must be between 0 and 100')
  .max(100, 'score must be between 0 and 100');

export const aiAnalysisResponseSchema = z.object({
  // Optional echo of the analyzed contribution; when present it must match.
  contributionId: z.string().uuid('contributionId must be a valid UUID').optional(),
  qualityScore: scoreSchema,
  riskScore: scoreSchema,
  similarityIndicators: z.unknown().optional(),
  suspiciousIndicators: z.array(z.unknown()).max(100).optional(),
  confidence: z
    .number({ message: 'confidence must be a number' })
    .min(0, 'confidence must be between 0 and 1')
    .max(1, 'confidence must be between 0 and 1'),
  explanation: z.string().max(5000, 'explanation is too long').optional(),
  modelVersion: z
    .string({ message: 'modelVersion is required' })
    .trim()
    .min(1, 'modelVersion is required')
    .max(50, 'modelVersion must be at most 50 characters'),
});

/**
 * Validate a raw AI response. Throws ZodError on invalid data.
 */
export function validateAnalysisResponse(raw) {
  return aiAnalysisResponseSchema.parse(raw);
}

export default { aiAnalysisResponseSchema, validateAnalysisResponse };
