import { z } from 'zod';

/**
 * Validation schemas for contributions (Module 5).
 */

export const CONTRIBUTION_TYPES = [
  'FEATURE',
  'BUG_FIX',
  'DOCUMENTATION',
  'REFACTORING',
  'TESTING',
  'OTHER',
];

export const CONTRIBUTION_STATUSES = [
  'SUBMITTED',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'UNDER_AI_ANALYSIS',
  'UNDER_COMMUNITY_REVIEW',
  'APPROVED',
  'REJECTED',
  'DISPUTED',
];

const githubPRNumberSchema = z
  .number({ message: 'githubPRNumber must be a number' })
  .int('githubPRNumber must be an integer')
  .positive('githubPRNumber must be positive');

export const createContributionSchema = z
  .object({
    repositoryId: z.string().uuid('repositoryId must be a valid UUID'),
    githubPRNumber: githubPRNumberSchema.optional(),
    githubPRUrl: z
      .string()
      .trim()
      .url('githubPRUrl must be a valid URL')
      .max(500)
      .optional(),
    title: z
      .string()
      .trim()
      .min(3, 'Title must be at least 3 characters')
      .max(500, 'Title must be at most 500 characters'),
    description: z.string().trim().max(5000, 'Description is too long').optional(),
    contributionType: z.enum(CONTRIBUTION_TYPES).optional(),
  })
  .refine((data) => Boolean(data.githubPRNumber || data.githubPRUrl), {
    message: 'Either githubPRNumber or githubPRUrl is required',
  });

export const updateContributionStatusSchema = z.object({
  status: z.enum(CONTRIBUTION_STATUSES),
  reason: z.string().trim().max(500).optional(),
});

export const listContributionsSchema = z.object({
  status: z.enum(CONTRIBUTION_STATUSES).optional(),
  contributionType: z.enum(CONTRIBUTION_TYPES).optional(),
  repositoryId: z.string().uuid().optional(),
  contributorId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['recent', 'oldest']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export default {
  createContributionSchema,
  updateContributionStatusSchema,
  listContributionsSchema,
};
