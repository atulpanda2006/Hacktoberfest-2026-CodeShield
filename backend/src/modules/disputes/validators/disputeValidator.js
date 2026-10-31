import { z } from 'zod';

/**
 * Validation schemas for disputes (Module 11).
 */

export const DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'APPEALED'];

const evidenceSchema = z
  .unknown()
  .refine(
    (value) => value === undefined || (typeof value === 'object' && value !== null),
    { message: 'evidence must be a JSON object or array' }
  )
  .optional();

export const createDisputeSchema = z.object({
  contributionId: z.string().uuid('contributionId must be a valid UUID'),
  reason: z
    .string()
    .trim()
    .min(5, 'reason must be at least 5 characters')
    .max(500, 'reason must be at most 500 characters'),
  description: z
    .string()
    .trim()
    .min(10, 'description must be at least 10 characters')
    .max(5000, 'description must be at most 5000 characters'),
  evidence: evidenceSchema,
});

export const updateDisputeStatusSchema = z
  .object({
    status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'APPEALED']),
    resolution: z.string().trim().max(5000).optional(),
    // Optional outcome applied to the contribution when the dispute is resolved.
    contributionStatus: z.enum(['APPROVED', 'REJECTED']).optional(),
  })
  .refine(
    (data) =>
      !['RESOLVED', 'REJECTED'].includes(data.status) ||
      (typeof data.resolution === 'string' && data.resolution.trim().length >= 10),
    { message: 'A resolution of at least 10 characters is required to close a dispute', path: ['resolution'] }
  );

export const listDisputesSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(DISPUTE_STATUSES).optional(),
});

export default { createDisputeSchema, updateDisputeStatusSchema, listDisputesSchema };
