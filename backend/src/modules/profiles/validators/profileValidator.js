import { z } from 'zod';

/**
 * Validation schemas for developer profiles (Module 3).
 */

const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Full name cannot be empty')
  .max(100, 'Full name must be at most 100 characters');

const bioSchema = z
  .string()
  .trim()
  .max(2000, 'Bio must be at most 2000 characters');

const avatarUrlSchema = z
  .string()
  .trim()
  .url('Avatar URL must be a valid URL')
  .max(500, 'Avatar URL must be at most 500 characters');

// GitHub usernames: alphanumeric segments separated by single hyphens, no leading/trailing hyphen.
const githubUsernameSchema = z
  .string()
  .trim()
  .min(1, 'GitHub username cannot be empty')
  .max(39, 'GitHub username must be at most 39 characters')
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/,
    'Invalid GitHub username format'
  );

const skillsSchema = z
  .array(z.string().trim().min(1).max(50), { message: 'Skills must be an array of strings' })
  .max(30, 'A profile can list at most 30 skills');

const experienceLevelSchema = z.enum(['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL']);

export const createProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  bio: bioSchema.optional(),
  avatarUrl: avatarUrlSchema.optional(),
  githubUsername: githubUsernameSchema.optional(),
  githubProfileUrl: avatarUrlSchema.optional(),
  skills: skillsSchema.optional(),
  experienceLevel: experienceLevelSchema.optional(),
});

export const updateProfileSchema = createProfileSchema
  .extend({
    // Allow clearing optional text fields explicitly with null
    fullName: fullNameSchema.nullable().optional(),
    bio: bioSchema.nullable().optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
    githubProfileUrl: avatarUrlSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export default { createProfileSchema, updateProfileSchema };
