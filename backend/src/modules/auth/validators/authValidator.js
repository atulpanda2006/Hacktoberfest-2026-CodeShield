import { z } from 'zod';

/**
 * Zod validation schemas for authentication and user management.
 * All schemas validate incoming request bodies and throw ZodError on failure,
 * which is caught by the global errorHandler middleware.
 */

// Common field schemas
const usernameSchema = z
  .string({ required_error: 'Username is required' })
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must be at most 50 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .email('Invalid email format')
  .max(255, 'Email must be at most 255 characters');

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be at most 128 characters');

const roleSchema = z
  .enum(['DEVELOPER', 'MAINTAINER', 'REVIEWER', 'ADMIN'], {
    errorMap: () => ({ message: 'Role must be one of: DEVELOPER, MAINTAINER, REVIEWER, ADMIN' }),
  })
  .optional();

const accountStatusSchema = z
  .enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED'], {
    errorMap: () => ({ message: 'Account status must be one of: ACTIVE, SUSPENDED, DEACTIVATED' }),
  })
  .optional();

// ============================================================
// Registration Schema
// ============================================================
export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});

// ============================================================
// Login Schema
// ============================================================
export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

// ============================================================
// Update User Schema
// ============================================================
export const updateUserSchema = z.object({
  username: usernameSchema.optional(),
  email: emailSchema.optional(),
  role: roleSchema,
  accountStatus: accountStatusSchema,
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * Validate request body against a Zod schema.
 * Returns the parsed data or throws a ZodError.
 */
export function validateBody(schema) {
  return async (req, res, next) => {
    try {
      req.validatedBody = await schema.parseAsync(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}
