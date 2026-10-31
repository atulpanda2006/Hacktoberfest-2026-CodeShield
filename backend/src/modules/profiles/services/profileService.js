import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * ProfileService — business logic for developer profiles (Module 3).
 *
 * A profile is the public face of an account: it stores GitHub identity,
 * skills, experience level and aggregates contribution statistics on read.
 * Statistics are computed from the source tables rather than duplicated in
 * counters, so they can never drift out of sync.
 */

const PROFILE_FIELDS = {
  id: true,
  userId: true,
  fullName: true,
  bio: true,
  avatarUrl: true,
  githubUsername: true,
  githubProfileUrl: true,
  skills: true,
  experienceLevel: true,
  createdAt: true,
  updatedAt: true,
};

const PUBLIC_USER_FIELDS = {
  id: true,
  username: true,
  role: true,
  createdAt: true,
};

const PRIVATE_USER_FIELDS = {
  id: true,
  username: true,
  email: true,
  role: true,
  accountStatus: true,
  createdAt: true,
};

function githubProfileUrlFor(username) {
  return `https://github.com/${username}`;
}

function emptyStatusCounts() {
  return {
    SUBMITTED: 0,
    PENDING_VERIFICATION: 0,
    VERIFIED: 0,
    UNDER_AI_ANALYSIS: 0,
    UNDER_COMMUNITY_REVIEW: 0,
    APPROVED: 0,
    REJECTED: 0,
    DISPUTED: 0,
  };
}

export class ProfileService {
  /**
   * Create the developer profile for the authenticated user.
   * One account can only have a single profile.
   */
  static async createProfile(userId, data) {
    const prisma = getPrismaClient();

    const existing = await prisma.developerProfile.findUnique({ where: { userId } });
    if (existing) {
      throw AppError.conflict('A developer profile already exists for this account');
    }

    if (data.githubUsername) {
      await ProfileService.assertGithubUsernameAvailable(data.githubUsername);
    }

    const created = await prisma.developerProfile.create({
      data: {
        userId,
        fullName: data.fullName ?? null,
        bio: data.bio ?? null,
        avatarUrl: data.avatarUrl ?? null,
        githubUsername: data.githubUsername ?? null,
        githubProfileUrl:
          data.githubProfileUrl ??
          (data.githubUsername ? githubProfileUrlFor(data.githubUsername) : null),
        skills: data.skills ?? [],
        experienceLevel: data.experienceLevel ?? 'JUNIOR',
      },
      select: PROFILE_FIELDS,
    });

    return created;
  }

  /**
   * The authenticated user's own profile, including private account fields.
   */
  static async getMyProfile(userId) {
    const prisma = getPrismaClient();

    const profile = await prisma.developerProfile.findUnique({
      where: { userId },
      select: {
        ...PROFILE_FIELDS,
        user: { select: PRIVATE_USER_FIELDS },
      },
    });

    if (!profile) {
      throw AppError.notFound('Developer profile not found. Create a profile first.');
    }

    const stats = await ProfileService.getContributionStats(userId);

    return { ...profile, stats };
  }

  /**
   * Public profile for any user id.
   */
  static async getProfileByUserId(userId) {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountStatus: true },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    if (user.accountStatus === 'DEACTIVATED') {
      throw AppError.notFound('Developer profile not found');
    }

    const profile = await prisma.developerProfile.findUnique({
      where: { userId },
      select: {
        ...PROFILE_FIELDS,
        user: { select: PUBLIC_USER_FIELDS },
      },
    });

    if (!profile) {
      throw AppError.notFound('Developer profile not found');
    }

    const stats = await ProfileService.getContributionStats(userId);

    return { ...profile, stats };
  }

  /**
   * Update the authenticated user's profile. Always scoped to the caller's own
   * userId, so a user can never modify another developer's profile.
   */
  static async updateMyProfile(userId, data) {
    const prisma = getPrismaClient();

    const existing = await prisma.developerProfile.findUnique({ where: { userId } });
    if (!existing) {
      throw AppError.notFound('Developer profile not found. Create a profile first.');
    }

    if (data.githubUsername && data.githubUsername !== existing.githubUsername) {
      await ProfileService.assertGithubUsernameAvailable(data.githubUsername, existing.id);
    }

    const updateData = { ...data };

    // Changing the linked GitHub account refreshes the derived profile URL
    // unless the caller supplied one explicitly.
    if (data.githubUsername && data.githubProfileUrl === undefined) {
      updateData.githubProfileUrl = githubProfileUrlFor(data.githubUsername);
    }

    const updated = await prisma.developerProfile.update({
      where: { userId },
      data: updateData,
      select: PROFILE_FIELDS,
    });

    return updated;
  }

  /**
   * Contribution statistics used by profiles and dashboards.
   * Aggregations run in parallel to avoid sequential round-trips.
   */
  static async getContributionStats(userId) {
    const prisma = getPrismaClient();

    const [
      statusGroups,
      totalContributions,
      repositoryCount,
      reviewsReceived,
      trustAggregate,
      reputation,
    ] = await Promise.all([
      prisma.contribution.groupBy({
        by: ['status'],
        where: { contributorId: userId },
        _count: { _all: true },
      }),
      prisma.contribution.count({ where: { contributorId: userId } }),
      prisma.repositoryMember.count({ where: { userId } }),
      prisma.review.count({ where: { contribution: { contributorId: userId } } }),
      prisma.trustRelationship.aggregate({
        where: { targetUserId: userId },
        _count: { _all: true },
        _avg: { trustLevel: true },
      }),
      prisma.reputation.findUnique({ where: { userId } }),
    ]);

    const byStatus = emptyStatusCounts();
    for (const group of statusGroups || []) {
      if (byStatus[group.status] !== undefined) {
        byStatus[group.status] = group._count?._all ?? 0;
      }
    }

    const verified =
      byStatus.VERIFIED +
      byStatus.UNDER_AI_ANALYSIS +
      byStatus.UNDER_COMMUNITY_REVIEW +
      byStatus.APPROVED;

    return {
      contributions: {
        total: totalContributions,
        verified,
        approved: byStatus.APPROVED,
        rejected: byStatus.REJECTED,
        disputed: byStatus.DISPUTED,
        pendingVerification: byStatus.SUBMITTED + byStatus.PENDING_VERIFICATION,
        underReview: byStatus.UNDER_COMMUNITY_REVIEW,
        byStatus,
      },
      repositories: repositoryCount,
      reviewsReceived,
      trust: {
        received: trustAggregate?._count?._all ?? 0,
        averageTrustLevel: trustAggregate?._avg?.trustLevel ?? null,
      },
      reputation: reputation
        ? {
            overallScore: reputation.overallScore,
            qualityScore: reputation.qualityScore,
            reliabilityScore: reputation.reliabilityScore,
            consistencyScore: reputation.consistencyScore,
            communityScore: reputation.communityScore,
            updatedAt: reputation.updatedAt,
          }
        : null,
    };
  }

  /**
   * GitHub usernames are a unique identity link across the platform.
   * The database enforces this too; this check produces a friendly error.
   */
  static async assertGithubUsernameAvailable(githubUsername, excludeProfileId = null) {
    const prisma = getPrismaClient();

    const owner = await prisma.developerProfile.findUnique({ where: { githubUsername } });

    if (owner && owner.id !== excludeProfileId) {
      throw AppError.conflict('This GitHub username is already linked to another profile');
    }
  }
}

export default ProfileService;
