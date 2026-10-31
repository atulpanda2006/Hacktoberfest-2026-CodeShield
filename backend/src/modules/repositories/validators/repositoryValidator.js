import { z } from 'zod';

/**
 * Validation schemas for repository management (Module 4).
 * GitHub-derived fields (name, stars, language, url) are never accepted from
 * clients — they are fetched from the GitHub API.
 */

const fullNameSchema = z
  .string()
  .trim()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'fullName must use the owner/repository format')
  .max(255);

export const registerRepositorySchema = z
  .object({
    fullName: fullNameSchema.optional(),
    repositoryUrl: z.string().trim().url('repositoryUrl must be a valid URL').max(500).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Boolean(data.fullName || data.repositoryUrl), {
    message: 'Either fullName (owner/repo) or repositoryUrl is required',
  });

export const updateRepositorySchema = z
  .object({
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const addMemberSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID'),
  role: z.enum(['OWNER', 'MAINTAINER', 'CONTRIBUTOR']).optional(),
});

export const listRepositoriesSchema = z.object({
  search: z.string().trim().max(100).optional(),
  language: z.string().trim().max(50).optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  sort: z.enum(['recent', 'stars', 'name']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export default {
  registerRepositorySchema,
  updateRepositorySchema,
  addMemberSchema,
  listRepositoriesSchema,
};
