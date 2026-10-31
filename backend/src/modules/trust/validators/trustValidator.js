import { z } from 'zod';

/**
 * Validation schemas for trust relationships (Module 9).
 *
 * Trust levels:
 *   1 = weak endorsement     2 = worked together
 *   3 = would collaborate again   4 = strong endorsement
 *   5 = would vouch for as a maintainer
 */

export const trustLevelSchema = z
  .number({ message: 'trustLevel must be a number' })
  .int('trustLevel must be an integer')
  .min(1, 'trustLevel must be between 1 and 5')
  .max(5, 'trustLevel must be between 1 and 5');

export const createTrustSchema = z.object({
  targetUserId: z.string().uuid('targetUserId must be a valid UUID'),
  trustLevel: trustLevelSchema,
  trustReason: z.string().trim().max(500, 'trustReason must be at most 500 characters').optional(),
});

export const updateTrustSchema = z
  .object({
    trustLevel: trustLevelSchema.optional(),
    trustReason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export default { createTrustSchema, updateTrustSchema };
