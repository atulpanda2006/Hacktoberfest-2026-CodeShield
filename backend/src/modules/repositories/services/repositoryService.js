import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';
import { parsePagination } from '../../../utils/pagination.js';
import { GitHubClient } from '../../../integrations/github/githubClient.js';
import { toAppError } from '../../../integrations/github/githubErrorMapper.js';
import { GitHubAccountService } from '../../github/services/githubAccountService.js';

/**
 * RepositoryService — business logic for registered open-source repositories
 * (Module 4).
 *
 * Core rule: GitHub is the source of truth. A repository is only registered
 * after the GitHub API confirms it exists, and the registering user must be
 * able to prove ownership/maintainer access (repository owner login, GitHub
 * collaborator permission, or platform ADMIN).
 */

const REPOSITORY_PUBLIC_SELECT = {
  id: true,
  githubRepositoryId: true,
  name: true,
  fullName: true,
  description: true,
  repositoryUrl: true,
  ownerGithubUsername: true,
  primaryLanguage: true,
  visibility: true,
  stars: true,
  forks: true,
  createdAt: true,
  updatedAt: true,
};

/** Extract owner/repo from either a full name or a GitHub URL. */
export function parseRepositoryFullName({ fullName, repositoryUrl }) {
  if (fullName) return fullName.trim();

  if (repositoryUrl) {
    const cleaned = repositoryUrl.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
    const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/?#]+)/i);
    if (match) return `${match[1]}/${match[2]}`;
  }

  throw AppError.badRequest(
    'A valid GitHub repository URL (https://github.com/owner/repository) or fullName (owner/repository) is required'
  );
}

export class RepositoryService {
  /**
   * Register a repository after verifying it with GitHub.
   */
  static async registerRepository(user, data) {
    const prisma = getPrismaClient();
    const fullName = parseRepositoryFullName(data);

    // 1. The caller must have connected their OWN GitHub account. A shared
    //    platform token is never used for a privileged, user-specific action.
    const { token, githubUsername } = await GitHubAccountService.requireUserToken(user.id, {
      action: 'register a repository',
    });

    // 2. Verify the repository exists on GitHub. Never trust the client payload.
    let githubRepo;
    try {
      githubRepo = await GitHubClient.getRepository(fullName, token);
    } catch (error) {
      throw toAppError(error, {
        notFoundMessage: `Repository "${fullName}" was not found on GitHub`,
      });
    }

    if (!githubRepo) {
      throw AppError.serviceUnavailable('GitHub returned an empty repository payload');
    }

    // 3. Authorize the registrant and decide their repository role, using the
    //    caller's own credentials so GitHub evaluates *their* permissions.
    const membershipRole = await RepositoryService.resolveRegistrationRole(
      user,
      githubUsername,
      githubRepo,
      token
    );

    // 4. Duplicate protection (both GitHub id and full name are unique).
    const duplicate = await prisma.repository.findFirst({
      where: {
        OR: [
          { githubRepositoryId: githubRepo.githubRepositoryId },
          { fullName: { equals: githubRepo.fullName, mode: 'insensitive' } },
        ],
      },
      select: { id: true, fullName: true },
    });

    if (duplicate) {
      throw AppError.conflict(`Repository ${duplicate.fullName} is already registered`);
    }

    // 5. Repository + initial member must be created together.
    const repository = await prisma.$transaction(async (tx) => {
      const created = await tx.repository.create({
        data: {
          githubRepositoryId: githubRepo.githubRepositoryId,
          name: githubRepo.name,
          fullName: githubRepo.fullName,
          description: data.description ?? githubRepo.description,
          repositoryUrl: githubRepo.repositoryUrl,
          ownerGithubUsername: githubRepo.ownerGithubUsername,
          primaryLanguage: githubRepo.primaryLanguage,
          visibility: githubRepo.visibility,
          stars: githubRepo.stars,
          forks: githubRepo.forks,
        },
        select: REPOSITORY_PUBLIC_SELECT,
      });

      await tx.repositoryMember.create({
        data: {
          repositoryId: created.id,
          userId: user.id,
          role: membershipRole,
        },
      });

      return created;
    });

    return { ...repository, memberRole: membershipRole };
  }

  /**
   * Decide which repository role the registrant receives, and refuse the
   * registration when they cannot prove maintainer access.
   */
  static async resolveRegistrationRole(user, githubUsername, githubRepo, token) {
    const isOwner =
      githubUsername &&
      githubRepo.ownerGithubUsername &&
      githubUsername.toLowerCase() === githubRepo.ownerGithubUsername.toLowerCase();

    if (isOwner || user.role === 'ADMIN') return 'OWNER';

    // Collaborator check runs as the registering user: GitHub evaluates the
    // permissions of that specific token, never a shared platform credential.
    if (githubUsername && token) {
      let access;
      try {
        access = await GitHubClient.getCollaboratorPermission(
          githubRepo.fullName,
          githubUsername,
          token
        );
      } catch (error) {
        throw toAppError(error);
      }

      if (access.isCollaborator && ['admin', 'maintain', 'write'].includes(access.permission)) {
        return 'MAINTAINER';
      }
    }

    throw AppError.forbidden(
      `GitHub account @${githubUsername} does not own or maintain ${githubRepo.fullName}. ` +
        'Only the repository owner or a collaborator with write access can register it.'
    );
  }

  /**
   * Paginated repository list with search and filters.
   */
  static async listRepositories(query = {}) {
    const prisma = getPrismaClient();
    const { page, limit, skip } = parsePagination(query);

    const where = {};

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.language) {
      where.primaryLanguage = { equals: query.language, mode: 'insensitive' };
    }

    if (query.visibility) {
      where.visibility = query.visibility;
    }

    const orderBy =
      query.sort === 'stars'
        ? [{ stars: 'desc' }, { createdAt: 'desc' }]
        : query.sort === 'name'
          ? [{ name: 'asc' }]
          : [{ createdAt: 'desc' }];

    const [items, total] = await Promise.all([
      prisma.repository.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          ...REPOSITORY_PUBLIC_SELECT,
          _count: { select: { members: true, contributions: true } },
        },
      }),
      prisma.repository.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Repository detail including members and counts.
   */
  static async getRepositoryById(repositoryId) {
    const prisma = getPrismaClient();

    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: {
        ...REPOSITORY_PUBLIC_SELECT,
        members: {
          select: {
            id: true,
            role: true,
            joinedAt: true,
            user: {
              select: { id: true, username: true, role: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { contributions: true } },
      },
    });

    if (!repository) {
      throw AppError.notFound('Repository not found');
    }

    return repository;
  }

  /**
   * Update editable metadata. GitHub-sourced fields are never client-writable.
   */
  static async updateRepository(repositoryId, user, data) {
    const prisma = getPrismaClient();
    await RepositoryService.assertRepositoryOwner(repositoryId, user);

    const repository = await prisma.repository.update({
      where: { id: repositoryId },
      data,
      select: REPOSITORY_PUBLIC_SELECT,
    });

    return repository;
  }

  /**
   * Remove a repository. Contributions, evidence and reviews cascade.
   */
  static async deleteRepository(repositoryId, user) {
    const prisma = getPrismaClient();
    await RepositoryService.assertRepositoryOwner(repositoryId, user);

    await prisma.repository.delete({ where: { id: repositoryId } });
  }

  /**
   * Add or update a repository member. Idempotent by (repositoryId, userId).
   */
  static async addMember(repositoryId, actor, data) {
    const prisma = getPrismaClient();
    await RepositoryService.assertRepositoryOwner(repositoryId, actor);

    const targetUser = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, username: true, accountStatus: true },
    });

    if (!targetUser) {
      throw AppError.notFound('User not found');
    }

    if (targetUser.accountStatus !== 'ACTIVE') {
      throw AppError.badRequest('Cannot add a user whose account is not active');
    }

    const role = data.role ?? 'CONTRIBUTOR';

    const member = await prisma.repositoryMember.upsert({
      where: {
        repositoryId_userId: { repositoryId, userId: targetUser.id },
      },
      create: {
        repositoryId,
        userId: targetUser.id,
        role,
      },
      update: { role },
      select: {
        id: true,
        role: true,
        joinedAt: true,
        user: { select: { id: true, username: true, role: true } },
      },
    });

    return member;
  }

  /**
   * Contributions submitted against a repository (paginated, filterable).
   * Delegates the query shape to the contribution module.
   */
  static async getRepositoryContributions(repositoryId, query = {}) {
    const prisma = getPrismaClient();

    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true },
    });

    if (!repository) {
      throw AppError.notFound('Repository not found');
    }

    const { ContributionService } = await import('../../contributions/services/contributionService.js');
    return ContributionService.listByRepository(repositoryId, query);
  }

  /**
   * Only repository OWNERs (or platform ADMINs) can mutate a repository.
   */
  static async assertRepositoryOwner(repositoryId, user) {
    const prisma = getPrismaClient();

    const repository = await prisma.repository.findUnique({
      where: { id: repositoryId },
      select: { id: true, fullName: true },
    });

    if (!repository) {
      throw AppError.notFound('Repository not found');
    }

    if (user.role === 'ADMIN') return repository;

    const membership = await prisma.repositoryMember.findUnique({
      where: { repositoryId_userId: { repositoryId, userId: user.id } },
      select: { role: true },
    });

    if (!membership || membership.role !== 'OWNER') {
      throw AppError.forbidden(
        'Only repository owners or platform administrators can modify this repository'
      );
    }

    return repository;
  }
}

export default RepositoryService;
