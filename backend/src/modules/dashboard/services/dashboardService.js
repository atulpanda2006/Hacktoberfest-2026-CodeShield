import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';
import { ReputationService } from '../../reputation/services/reputationService.js';

/**
 * DashboardService — read-only aggregations for the frontend (Module 12).
 *
 * Every dashboard is built from a small number of parallel aggregate queries
 * instead of per-row lookups, and all long lists are limited so a dashboard
 * request stays cheap as the platform grows.
 */

const ACTIVE_DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'APPEALED'];

const REVIEW_QUEUE_STATUSES = ['VERIFIED', 'UNDER_AI_ANALYSIS', 'UNDER_COMMUNITY_REVIEW'];

function statusCounts(groups, fallback = {}) {
  const counts = { ...fallback };
  for (const group of groups ?? []) {
    counts[group.status] = group._count?._all ?? 0;
  }
  return counts;
}

export class DashboardService {
  /**
   * Developer dashboard: my reputation, contributions, reviews, disputes, trust.
   */
  static async getDeveloperDashboard(user) {
    const prisma = getPrismaClient();

    const [
      reputation,
      contributionGroups,
      totalContributions,
      recentContributions,
      recentReviews,
      openDisputes,
      repositoryCount,
      trustGiven,
      trustReceived,
      trustAggregate,
    ] = await Promise.all([
      ReputationService.getReputation(user.id),
      prisma.contribution.groupBy({
        by: ['status'],
        where: { contributorId: user.id },
        _count: { _all: true },
      }),
      prisma.contribution.count({ where: { contributorId: user.id } }),
      prisma.contribution.findMany({
        where: { contributorId: user.id },
        orderBy: { submittedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          contributionType: true,
          githubPRUrl: true,
          submittedAt: true,
          repository: { select: { id: true, fullName: true } },
        },
      }),
      prisma.review.findMany({
        where: { contribution: { contributorId: user.id } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          decision: true,
          rating: true,
          comments: true,
          createdAt: true,
          reviewer: { select: { id: true, username: true } },
          contribution: { select: { id: true, title: true } },
        },
      }),
      prisma.dispute.count({
        where: {
          contribution: { contributorId: user.id },
          status: { in: ACTIVE_DISPUTE_STATUSES },
        },
      }),
      prisma.repositoryMember.count({ where: { userId: user.id } }),
      prisma.trustRelationship.count({ where: { sourceUserId: user.id } }),
      prisma.trustRelationship.count({ where: { targetUserId: user.id } }),
      prisma.trustRelationship.aggregate({
        where: { targetUserId: user.id },
        _avg: { trustLevel: true },
      }),
    ]);

    const byStatus = statusCounts(contributionGroups, {
      SUBMITTED: 0,
      PENDING_VERIFICATION: 0,
      VERIFIED: 0,
      UNDER_AI_ANALYSIS: 0,
      UNDER_COMMUNITY_REVIEW: 0,
      APPROVED: 0,
      REJECTED: 0,
      DISPUTED: 0,
    });

    return {
      user: { id: user.id, username: user.username, role: user.role },
      reputation,
      contributions: {
        total: totalContributions,
        byStatus,
        verified:
          byStatus.VERIFIED +
          byStatus.UNDER_AI_ANALYSIS +
          byStatus.UNDER_COMMUNITY_REVIEW +
          byStatus.APPROVED,
        awaitingReview: byStatus.UNDER_COMMUNITY_REVIEW + byStatus.UNDER_AI_ANALYSIS,
      },
      repositories: repositoryCount,
      recentContributions,
      recentReviews,
      openDisputes,
      trust: {
        given: trustGiven,
        received: trustReceived,
        averageReceivedLevel: trustAggregate?._avg?.trustLevel ?? null,
      },
    };
  }

  /**
   * Maintainer dashboard: repositories they own/maintain and the review queue.
   */
  static async getMaintainerDashboard(user) {
    const prisma = getPrismaClient();

    const memberships = await prisma.repositoryMember.findMany({
      where: { userId: user.id, role: { in: ['OWNER', 'MAINTAINER'] } },
      orderBy: { joinedAt: 'asc' },
      select: {
        role: true,
        repository: {
          select: {
            id: true,
            name: true,
            fullName: true,
            primaryLanguage: true,
            stars: true,
            _count: { select: { contributions: true, members: true } },
          },
        },
      },
    });

    const repositoryIds = memberships.map((item) => item.repository.id);

    if (repositoryIds.length === 0) {
      return {
        user: { id: user.id, username: user.username, role: user.role },
        repositories: [],
        reviewQueue: [],
        openDisputes: 0,
        recentReviews: [],
        summary: { repositories: 0, awaitingReview: 0, contributions: 0 },
      };
    }

    const [reviewQueue, queueGroups, openDisputes, recentReviews, contributionTotal] =
      await Promise.all([
        prisma.contribution.findMany({
          where: {
            repositoryId: { in: repositoryIds },
            status: { in: REVIEW_QUEUE_STATUSES },
          },
          orderBy: { submittedAt: 'asc' },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            githubPRUrl: true,
            submittedAt: true,
            contributor: { select: { id: true, username: true } },
            repository: { select: { id: true, fullName: true } },
          },
        }),
        prisma.contribution.groupBy({
          by: ['status'],
          where: { repositoryId: { in: repositoryIds } },
          _count: { _all: true },
        }),
        prisma.dispute.count({
          where: {
            contribution: { repositoryId: { in: repositoryIds } },
            status: { in: ACTIVE_DISPUTE_STATUSES },
          },
        }),
        prisma.review.findMany({
          where: { reviewerId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            decision: true,
            rating: true,
            createdAt: true,
            contribution: { select: { id: true, title: true } },
          },
        }),
        prisma.contribution.count({ where: { repositoryId: { in: repositoryIds } } }),
      ]);

    const byStatus = statusCounts(queueGroups);

    return {
      user: { id: user.id, username: user.username, role: user.role },
      repositories: memberships.map((item) => ({ role: item.role, ...item.repository })),
      reviewQueue,
      openDisputes,
      recentReviews,
      summary: {
        repositories: memberships.length,
        contributions: contributionTotal,
        awaitingReview: REVIEW_QUEUE_STATUSES.reduce(
          (sum, status) => sum + (byStatus[status] ?? 0),
          0
        ),
      },
    };
  }

  /**
   * Administrator dashboard: platform-wide health and queues.
   */
  static async getAdminDashboard(user) {
    const prisma = getPrismaClient();

    const [
      userGroups,
      totalUsers,
      totalRepositories,
      contributionGroups,
      totalContributions,
      disputeGroups,
      totalDisputes,
      analysisGroups,
      reputationAggregate,
      recentDisputes,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.user.count(),
      prisma.repository.count(),
      prisma.contribution.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.contribution.count(),
      prisma.dispute.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.dispute.count(),
      prisma.aIAnalysis.groupBy({ by: ['analysisStatus'], _count: { _all: true } }),
      prisma.reputation.aggregate({ _avg: { overallScore: true }, _count: { _all: true } }),
      prisma.dispute.findMany({
        where: { status: { in: ACTIVE_DISPUTE_STATUSES } },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: {
          id: true,
          reason: true,
          status: true,
          createdAt: true,
          contribution: { select: { id: true, title: true, fullName: true } },
          reporter: { select: { id: true, username: true } },
        },
      }),
    ]);

    const usersByRole = {};
    for (const group of userGroups ?? []) {
      usersByRole[group.role] = group._count?._all ?? 0;
    }

    return {
      administrator: { id: user.id, username: user.username },
      users: { total: totalUsers, byRole: usersByRole },
      repositories: { total: totalRepositories },
      contributions: {
        total: totalContributions,
        byStatus: statusCounts(contributionGroups),
      },
      disputes: { total: totalDisputes, byStatus: statusCounts(disputeGroups) },
      aiAnalyses: { byStatus: statusCounts(analysisGroups) },
      reputation: {
        calculatedProfiles: reputationAggregate?._count?._all ?? 0,
        averageOverallScore: reputationAggregate?._avg?.overallScore ?? null,
      },
      openDisputes: recentDisputes,
    };
  }

  /**
   * Public platform statistics (safe aggregate counters only).
   */
  static async getStatistics() {
    const prisma = getPrismaClient();

    const [
      developersCount,
      repositoriesCount,
      contributionGroups,
      totalContributions,
      disputeGroups,
      reputationAggregate,
      languageGroups,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'DEVELOPER', accountStatus: 'ACTIVE' } }),
      prisma.repository.count(),
      prisma.contribution.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.contribution.count(),
      prisma.dispute.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.reputation.aggregate({ _avg: { overallScore: true }, _count: { _all: true } }),
      prisma.repository.groupBy({
        by: ['primaryLanguage'],
        _count: { _all: true },
        orderBy: { _count: { primaryLanguage: 'desc' } },
        take: 10,
      }),
    ]);

    const byStatus = statusCounts(contributionGroups);
    const verified =
      (byStatus.VERIFIED ?? 0) +
      (byStatus.UNDER_AI_ANALYSIS ?? 0) +
      (byStatus.UNDER_COMMUNITY_REVIEW ?? 0) +
      (byStatus.APPROVED ?? 0);

    return {
      developers: developersCount,
      repositories: repositoriesCount,
      contributions: {
        total: totalContributions,
        verified,
        approved: byStatus.APPROVED ?? 0,
        rejected: byStatus.REJECTED ?? 0,
        disputed: byStatus.DISPUTED ?? 0,
      },
      disputes: byStatusCounts(disputeGroups),
      reputation: {
        calculatedProfiles: reputationAggregate?._count?._all ?? 0,
        averageOverallScore: reputationAggregate?._avg?.overallScore ?? null,
      },
      topLanguages: (languageGroups ?? [])
        .filter((group) => group.primaryLanguage)
        .map((group) => ({
          language: group.primaryLanguage,
          repositories: group._count?._all ?? 0,
        })),
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Dispute counters use the `status` key already, so no aliasing is needed. */
function byStatusCounts(groups) {
  return statusCounts(groups);
}

export default DashboardService;
