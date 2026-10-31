import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';
import { parsePagination } from '../../../utils/pagination.js';
import {
  canTransition,
  CONTRIBUTOR_ALLOWED_TARGETS,
  FINAL_STATUSES,
} from '../../../utils/contributionStatus.js';
import { ReputationService } from '../../reputation/services/reputationService.js';

/**
 * ContributionService — business logic for contribution submission and
 * lifecycle management (Module 5).
 *
 * Contributions are the unit of value in the network. Submitting one only
 * records intent; authenticity is established by Module 6 (verification),
 * quality by Module 7 (AI) and Module 10 (reviews). This module therefore never
 * marks a contribution verified or approved on its own, and enforces an explicit
 * status state machine.
 */

const CONTRIBUTION_LIST_SELECT = {
  id: true,
  contributorId: true,
  repositoryId: true,
  githubPRNumber: true,
  githubPRUrl: true,
  title: true,
  description: true,
  contributionType: true,
  status: true,
  submittedAt: true,
  updatedAt: true,
  repository: { select: { id: true, name: true, fullName: true, ownerGithubUsername: true } },
  contributor: { select: { id: true, username: true } },
};

const CONTRIBUTION_DETAIL_SELECT = {
  ...CONTRIBUTION_LIST_SELECT,
  githubPRId: true,
  evidence: {
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
  verifications: {
    orderBy: { verifiedAt: 'desc' },
    take: 10,
  },
  aiAnalyses: {
    orderBy: { analyzedAt: 'desc' },
    take: 3,
  },
  reviews: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      decision: true,
      rating: true,
      comments: true,
      createdAt: true,
      reviewer: { select: { id: true, username: true } },
    },
  },
  disputes: {
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, reason: true, createdAt: true },
  },
};

/**
 * Accepts https://github.com/owner/repo/pull/123 (optionally with a trailing path)
 * and returns the PR number.
 */
export function parsePullRequestNumber(url) {
  if (!url) return null;
  const match = String(url).match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

export class ContributionService {
  /**
   * Submit a contribution for a registered repository.
   */
  static async createContribution(user, data) {
    const prisma = getPrismaClient();

    const repository = await prisma.repository.findUnique({
      where: { id: data.repositoryId },
      select: { id: true, fullName: true },
    });

    if (!repository) {
      throw AppError.notFound(
        'Repository not found. Register the repository before submitting contributions.'
      );
    }

    // A linked GitHub identity is required so Module 6 can verify authorship.
    const profile = await prisma.developerProfile.findUnique({
      where: { userId: user.id },
      select: { githubUsername: true },
    });

    if (!profile?.githubUsername) {
      throw AppError.badRequest(
        'Link your GitHub username in your developer profile before submitting contributions'
      );
    }

    const urlPRNumber = parsePullRequestNumber(data.githubPRUrl);
    const number = data.githubPRNumber ?? urlPRNumber;
    const githubPRNumber = number;

    let githubPRUrl = data.githubPRUrl ?? null;

    if (githubPRUrl && !urlPRNumber) {
      throw AppError.badRequest(
        'githubPRUrl must point to a GitHub pull request (https://github.com/owner/repo/pull/123)'
      );
    }

    if (data.githubPRNumber && urlPRNumber && data.githubPRNumber !== urlPRNumber) {
      throw AppError.badRequest('githubPRNumber does not match the pull request URL');
    }

    if (!githubPRUrl) {
      githubPRUrl = `https://github.com/${repository.fullName}/pull/${githubPRNumber}`;
    }

    // Duplicate PR submissions are rejected both here and by a unique constraint.
    const duplicate = await prisma.contribution.findFirst({
      where: {
        repositoryId: repository.id,
        OR: [
          { githubPRNumber },
          ...(githubPRUrl ? [{ githubPRUrl: { equals: githubPRUrl, mode: 'insensitive' } }] : []),
        ],
      },
      select: { id: true, githubPRUrl: true, githubPRNumber: true },
    });

    if (duplicate) {
      throw AppError.conflict(
        `Pull request #${githubPRNumber} has already been submitted for this repository`
      );
    }

    const contribution = await prisma.$transaction(async (tx) => {
      const created = await tx.contribution.create({
        data: {
          contributorId: user.id,
          repositoryId: repository.id,
          githubPRNumber,
          githubPRUrl,
          title: data.title,
          description: data.description ?? null,
          contributionType: data.contributionType ?? 'OTHER',
          status: 'SUBMITTED',
        },
        select: CONTRIBUTION_LIST_SELECT,
      });

      // Submitting a contribution makes the developer a repository contributor.
      // Existing members keep their role (empty update).
      await tx.repositoryMember.upsert({
        where: { repositoryId_userId: { repositoryId: repository.id, userId: user.id } },
        create: { repositoryId: repository.id, userId: user.id, role: 'CONTRIBUTOR' },
        update: {},
      });

      return created;
    });

    return contribution;
  }

  /**
   * Generic paginated list used by /contributions and /contributions/me.
   */
  static async listContributions(query = {}, { contributorId = null } = {}) {
    const prisma = getPrismaClient();
    const { page, limit, skip } = parsePagination(query);

    const where = {};

    if (contributorId) where.contributorId = contributorId;
    if (query.contributorId) where.contributorId = query.contributorId;
    if (query.repositoryId) where.repositoryId = query.repositoryId;
    if (query.status) where.status = query.status;
    if (query.contributionType) where.contributionType = query.contributionType;

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const orderBy =
      query.sort === 'oldest' ? [{ submittedAt: 'asc' }] : [{ submittedAt: 'desc' }];

    const [items, total] = await Promise.all([
      prisma.contribution.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          ...CONTRIBUTION_LIST_SELECT,
          _count: { select: { evidence: true, reviews: true } },
        },
      }),
      prisma.contribution.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  static async listByRepository(repositoryId, query = {}) {
    return ContributionService.listContributions({ ...query, repositoryId });
  }

  static async listByContributor(contributorId, query = {}) {
    return ContributionService.listContributions({ ...query, contributorId });
  }

  /**
   * Contribution detail with evidence, verification, AI and review history.
   */
  static async getContributionById(contributionId) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: CONTRIBUTION_DETAIL_SELECT,
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    return contribution;
  }

  /**
   * Update the lifecycle status of a contribution.
   *
   * Permissions:
   *  - contributor: SUBMITTED -> PENDING_VERIFICATION only
   *  - repository owner/maintainer member, REVIEWER, or MAINTAINER: review outcomes
   *  - ADMIN: any transition allowed by the state machine
   *  - nobody except ADMIN can approve/reject their own contribution
   */
  static async updateStatus(contributionId, user, { status: nextStatus, reason }) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        status: true,
        contributorId: true,
        repositoryId: true,
        title: true,
      },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    if (nextStatus === 'DISPUTED') {
      throw AppError.badRequest(
        'Disputed status is managed by the disputes module. File a dispute instead.'
      );
    }

    if (contribution.status === nextStatus) {
      // Idempotent no-op, keeps repeated PATCH requests harmless.
      return ContributionService.getContributionById(contributionId);
    }

    if (!canTransition(contribution.status, nextStatus)) {
      throw AppError.conflict(
        `Invalid status transition: ${contribution.status} -> ${nextStatus}`
      );
    }

    const isContributor = contribution.contributorId === user.id;
    const isAdmin = user.role === 'ADMIN';
    const membership = await prisma.repositoryMember.findUnique({
      where: {
        repositoryId_userId: { repositoryId: contribution.repositoryId, userId: user.id },
      },
      select: { role: true },
    });

    const isRepositoryMaintainer = ['OWNER', 'MAINTAINER'].includes(membership?.role);
    const isPlatformReviewer = ['MAINTAINER', 'REVIEWER'].includes(user.role);

    if (!isAdmin) {
      if (isContributor) {
        if (!CONTRIBUTOR_ALLOWED_TARGETS.includes(nextStatus)) {
          throw AppError.forbidden(
            'Contributors cannot change the outcome of their own contribution'
          );
        }
      } else if (!isRepositoryMaintainer && !isPlatformReviewer) {
        throw AppError.forbidden('You are not allowed to update this contribution');
      }

      // Even a maintainer of the repository cannot self-approve.
      if (isContributor && FINAL_STATUSES.includes(nextStatus)) {
        throw AppError.forbidden(
          'Contributors cannot approve or reject their own contributions'
        );
      }
    }

    const updated = await prisma.contribution.update({
      where: { id: contributionId },
      data: { status: nextStatus },
      select: CONTRIBUTION_LIST_SELECT,
    });

    // Verified / approved / rejected outcomes change reputation inputs.
    if (['VERIFIED', 'APPROVED', 'REJECTED'].includes(nextStatus)) {
      await ReputationService.recalculateAfterEvent(contribution.contributorId, {
        reason:
          reason ??
          `Contribution "${contribution.title}" moved to ${nextStatus}`,
        sourceType: 'CONTRIBUTION_STATUS',
        sourceId: contribution.id,
      });
    }

    return ContributionService.getContributionById(updated.id);
  }
}

export default ContributionService;
