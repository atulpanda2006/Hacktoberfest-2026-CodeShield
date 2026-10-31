import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';

/**
 * TrustService — directed trust relationships between developers (Module 9).
 *
 * How this differs from reputation:
 *   Reputation is a platform-wide, evidence-derived score about a developer.
 *   A trust relationship is one developer's personal, directional endorsement
 *   of another, based on a real interaction (a shared repository, a review, or
 *   maintainership). It is never aggregated into the reputation score and it
 *   never "proves" someone is credible — it only records who trusts whom.
 *
 * Safeguards:
 *   - no self trust
 *   - no duplicate relationships (DB unique constraint + check)
 *   - an endorsement requires an interaction trail (anti-sockpuppet measure)
 *   - only the source developer can update or delete their endorsement
 */

const TRUST_LEVEL_MEANING = {
  1: 'Weak endorsement',
  2: 'Has worked together',
  3: 'Would collaborate again',
  4: 'Strong endorsement',
  5: 'Would vouch for as a maintainer',
};

const RELATIONSHIP_SELECT = {
  id: true,
  sourceUserId: true,
  targetUserId: true,
  trustLevel: true,
  trustReason: true,
  createdAt: true,
  updatedAt: true,
};

export class TrustService {
  /**
   * Create a directed trust relationship.
   */
  static async createTrust(sourceUser, data) {
    const prisma = getPrismaClient();

    if (data.targetUserId === sourceUser.id) {
      throw AppError.badRequest('Developers cannot trust themselves');
    }

    const target = await prisma.user.findUnique({
      where: { id: data.targetUserId },
      select: { id: true, username: true, accountStatus: true },
    });

    if (!target) {
      throw AppError.notFound('Target user not found');
    }

    if (target.accountStatus !== 'ACTIVE') {
      throw AppError.badRequest('Cannot create a trust relationship with an inactive account');
    }

    const existing = await prisma.trustRelationship.findUnique({
      where: {
        sourceUserId_targetUserId: {
          sourceUserId: sourceUser.id,
          targetUserId: data.targetUserId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw AppError.conflict('A trust relationship with this developer already exists');
    }

    const evidence = await TrustService.findInteractionEvidence(sourceUser.id, data.targetUserId);

    if (!evidence.eligible) {
      throw AppError.forbidden(
        'Trust relationships require a real interaction: a shared repository, a review you wrote, or maintainership of a repository the developer contributed to'
      );
    }

    const relationship = await prisma.trustRelationship.create({
      data: {
        sourceUserId: sourceUser.id,
        targetUserId: data.targetUserId,
        trustLevel: data.trustLevel,
        trustReason: data.trustReason ?? null,
      },
      select: RELATIONSHIP_SELECT,
    });

    return {
      ...relationship,
      trustLevelMeaning: TRUST_LEVEL_MEANING[relationship.trustLevel],
      evidence: evidence.reasons,
      target: { id: target.id, username: target.username },
    };
  }

  /**
   * Update the trust level / reason of a relationship. Source user or ADMIN only.
   */
  static async updateTrust(relationshipId, user, data) {
    const prisma = getPrismaClient();

    const relationship = await prisma.trustRelationship.findUnique({
      where: { id: relationshipId },
      select: { id: true, sourceUserId: true },
    });

    if (!relationship) {
      throw AppError.notFound('Trust relationship not found');
    }

    if (relationship.sourceUserId !== user.id && user.role !== 'ADMIN') {
      throw AppError.forbidden('Only the developer who created this endorsement can change it');
    }

    const updated = await prisma.trustRelationship.update({
      where: { id: relationshipId },
      data,
      select: RELATIONSHIP_SELECT,
    });

    return {
      ...updated,
      trustLevelMeaning: TRUST_LEVEL_MEANING[updated.trustLevel],
    };
  }

  /**
   * Delete a relationship. Source user or ADMIN only.
   */
  static async deleteTrust(relationshipId, user) {
    const prisma = getPrismaClient();

    const relationship = await prisma.trustRelationship.findUnique({
      where: { id: relationshipId },
      select: { id: true, sourceUserId: true },
    });

    if (!relationship) {
      throw AppError.notFound('Trust relationship not found');
    }

    if (relationship.sourceUserId !== user.id && user.role !== 'ADMIN') {
      throw AppError.forbidden('Only the developer who created this endorsement can remove it');
    }

    await prisma.trustRelationship.delete({ where: { id: relationshipId } });
  }

  /**
   * The caller's own trust network: given, received, mutual.
   */
  static async getMyTrust(user) {
    const network = await TrustService.getTrustNetwork(user.id);

    return {
      ...network,
      given: network.given.map((item) => ({
        ...item,
        trustLevelMeaning: TRUST_LEVEL_MEANING[item.trustLevel],
      })),
      received: network.received.map((item) => ({
        ...item,
        trustLevelMeaning: TRUST_LEVEL_MEANING[item.trustLevel],
      })),
    };
  }

  /**
   * Public trust network for any developer.
   */
  static async getTrustNetwork(userId) {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    const [given, received, givenCount, receivedCount, receivedAggregate] = await Promise.all([
      prisma.trustRelationship.findMany({
        where: { sourceUserId: userId },
        orderBy: [{ trustLevel: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        select: {
          ...RELATIONSHIP_SELECT,
          targetUser: { select: { id: true, username: true, role: true } },
        },
      }),
      prisma.trustRelationship.findMany({
        where: { targetUserId: userId },
        orderBy: [{ trustLevel: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        select: {
          ...RELATIONSHIP_SELECT,
          sourceUser: { select: { id: true, username: true, role: true } },
        },
      }),
      prisma.trustRelationship.count({ where: { sourceUserId: userId } }),
      prisma.trustRelationship.count({ where: { targetUserId: userId } }),
      prisma.trustRelationship.aggregate({
        where: { targetUserId: userId },
        _avg: { trustLevel: true },
      }),
    ]);

    const givenIds = new Set(given.map((item) => item.targetUserId));
    const mutualWith = received
      .filter((item) => givenIds.has(item.sourceUserId))
      .map((item) => item.sourceUserId);

    return {
      userId,
      username: user.username,
      given,
      received,
      stats: {
        given: givenCount,
        received: receivedCount,
        mutual: mutualWith.length,
        averageReceivedLevel: receivedAggregate?._avg?.trustLevel ?? null,
        mutualWith,
      },
      trustLevels: TRUST_LEVEL_MEANING,
    };
  }

  /**
   * Evidence required before one developer may endorse another.
   * Any one of: shared repository, the source reviewed the target's
   * contribution, or the source maintains a repository the target contributed to.
   */
  static async findInteractionEvidence(sourceUserId, targetUserId) {
    const prisma = getPrismaClient();

    const [sharedRepository, review, maintainedRepository] = await Promise.all([
      prisma.repositoryMember.findFirst({
        where: {
          userId: sourceUserId,
          repository: { members: { some: { userId: targetUserId } } },
        },
        select: { repositoryId: true },
      }),
      prisma.review.findFirst({
        where: {
          reviewerId: sourceUserId,
          contribution: { contributorId: targetUserId },
        },
        select: { id: true },
      }),
      prisma.contribution.findFirst({
        where: {
          contributorId: targetUserId,
          repository: {
            members: { some: { userId: sourceUserId, role: { in: ['OWNER', 'MAINTAINER'] } } },
          },
        },
        select: { id: true },
      }),
    ]);

    const reasons = [];
    if (sharedRepository) reasons.push('shared_repository');
    if (review) reasons.push('reviewed_contribution');
    if (maintainedRepository) reasons.push('maintainer_of_contribution_repository');

    return { eligible: reasons.length > 0, reasons };
  }
}

export default TrustService;
