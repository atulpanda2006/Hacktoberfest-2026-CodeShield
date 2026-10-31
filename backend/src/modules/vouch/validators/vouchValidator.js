import { z } from 'zod';

/**
 * Schema for checking vouch status.
 * Requires a username field.
 */
export const vouchCheckSchema = z.object({
  username: z
    .string({ required_error: 'Username is required' })
    .trim()
    .min(1, 'Username must not be empty'),
});

/**
 * Schema for adding a vouch.
 * Requires username; reason is optional.
 */
export const vouchAddSchema = z.object({
  username: z
    .string({ required_error: 'Username is required' })
    .trim()
    .min(1, 'Username must not be empty'),
  reason: z.string().trim().optional(),
});

/**
 * Schema for removing/denouncing a user.
 * Requires username; reason is optional.
 */
export const vouchRemoveSchema = z.object({
  username: z
    .string({ required_error: 'Username is required' })
    .trim()
    .min(1, 'Username must not be empty'),
  reason: z.string().trim().optional(),
});

export default {
  vouchCheckSchema,
  vouchAddSchema,
  vouchRemoveSchema,
};