import { z } from 'zod';

/**
 * Validation for GitHub connection endpoints.
 *
 * Tokens are accepted here but never echoed back in any response or log.
 */
export const connectTokenSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, 'This does not look like a GitHub token')
    .max(255, 'GitHub tokens are at most 255 characters')
    .regex(
      /^[A-Za-z0-9_.-]+$/,
      'A GitHub token may only contain letters, numbers, "_", "." and "-"'
    ),
});

export default { connectTokenSchema };
