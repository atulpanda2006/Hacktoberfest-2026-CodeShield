import { z } from 'zod';

/**
 * Validation schemas for community reviews (Module 10).
 */

export const reviewDecisionSchema = z.enum(['APPROVE', 'REQUEST_CHANGES', 'REJECT']);

const ratingSchema = z
  .number({ message: 'rating must be a number' })
  .int('rating must be an integer')
  .min(1, 'rating must be between 1 and 5')
  .max(5, 'rating must be between 1 and 5');

export const createReviewSchema = z.object({
  contributionId: z.string().uuid('contributionId must be a valid UUID'),
  decision: reviewDecisionSchema,
  rating: ratingSchema.optional(),
  comments: z.string().trim().max(2000, 'comments must be at most 2000 characters').optional(),
});

export const updateReviewSchema = z
  .object({
    decision: reviewDecisionSchema.optional(),
    rating: ratingSchema.nullable().optional(),
    comments: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const listReviewsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  decision: reviewDecisionSchema.optional(),
});

export default { createReviewSchema, updateReviewSchema, listReviewsSchema };
