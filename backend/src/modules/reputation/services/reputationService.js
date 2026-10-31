import { getPrismaClient } from '../../../config/database.js';
import logger from '../../../utils/logger.js';
import { AppError } from '../../../utils/AppError.js';
import { parsePagination } from '../../../utils/pagination.js';
import { TRUSTED_STATUSES } from '../../../utils/contributionStatus.js';
import {
  computeReputation,
  CONSISTENCY_MONTHS,
  CHANGE_TOLERANCE,
} from './reputationEngine.js';

/**
 * ReputationService — turns stored evidence into a persisted, auditable
 * reputation (Module 8).
 *
 * Responsibilities:
 *  - load the evidence inputs (contributions, AI quality scores, reviews, disputes)
 *  - delegate the formula to the pure engine
 *  - persist the score and append an immutable history row when it changes
 *  - stay idempotent: recalculating without new evidence writes nothing
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function applyZeroBaseline() {
  return computeReputation({ submittedContributions: 0, verifiedContributions: 0 });
}

export class ReputationService {
  /**
   * Load evidence and compute (but do not persist) a reputation snapshot.
   */
  static async calculateForUser(userId) {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    const [contributions, aiAnalyses, reviews, resolvedDisputes] = await Promise.all([
      prisma.contribution.findMany({
        where: { contributorId: userId },
        select: { id: true, status: true, submittedAt: true },
      }),
      prisma.aIAnalysis.findMany({
        where: {
          analysisStatus: 'COMPLETED',
          qualityScore: { not: null },
          contribution: {
            contributorId: userId,
            status: { in: TRUSTED_STATUSES },
          },
        },
        select: { qualityScore: true },
      }),
      prisma.review.findMany({
        where: { contribution: { contributorId: userId } },
        select: { decision: true },
      }),
      prisma.dispute.findMany({
        where: {
          contribution: { contributorId: userId },
          status: 'RESOLVED',
        },
        select: { id: true, contribution: { select: { status: true } } },
      }),
    ]);

    const authentic = contributions.filter((item) =>
      TRUSTED_STATUSES.includes(item.status)
    );

    const now = new Date();
    const cutoff = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CONSISTENCY_MONTHS - 1), 1)
    );

    const activeMonths = new Set(
      authentic
        .filter((item) => item.submittedAt && new Date(item.submittedAt) >= cutoff)
        .map((item) => monthKey(new Date(item.submittedAt)))
    );

    const reviewDecisions = reviews.reduce(
      (acc, review) => {
        acc[review.decision] = (acc[review.decision] ?? 0) + 1;
        return acc;
      },
      { APPROVE: 0, REQUEST_CHANGES: 0, REJECT: 0 }
    );

    // Confirmed misconduct = a resolved dispute whose contribution was rejected.
    const confirmedMisconductCount = resolvedDisputes.filter(
      (dispute) => dispute.contribution?.status === 'REJECTED'
    ).length;

    const snapshot = computeReputation({
      submittedContributions: contributions.length,
      verifiedContributions: authentic.length,
      aiQualityScores: aiAnalyses.map((item) => item.qualityScore),
      activeMonthsLast6: activeMonths.size,
      reviewDecisions,
      confirmedMisconductCount,
    });

    return {
      snapshot,
      totalContributions: contributions.length,
      evidence: {
        contributions: contributions.length,
        authenticContributions: authentic.length,
        aiAnalyses: aiAnalyses.length,
        reviews: reviews.length,
        resolvedDisputes: resolvedDisputes.length,
      },
    };
  }

  /**
   * Read a developer's reputation. When it has never been calculated the
   * snapshot is computed on the fly without writing anything.
   */
  static async getReputation(userId) {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    const stored = await prisma.reputation.findUnique({ where: { userId } });

    if (stored) {
      return {
        userId,
        username: user.username,
        initialized: true,
        overallScore: stored.overallScore,
        qualityScore: stored.qualityScore,
        reliabilityScore: stored.reliabilityScore,
        consistencyScore: stored.consistencyScore,
        communityScore: stored.communityScore,
        totalContributions: stored.totalContributions,
        updatedAt: stored.updatedAt,
      };
    }

    const { snapshot, totalContributions } = await ReputationService.calculateForUser(userId);
    const baseline = totalContributions === 0 ? applyZeroBaseline() : snapshot;

    return {
      userId,
      username: user.username,
      initialized: false,
      overallScore: baseline.overallScore,
      qualityScore: baseline.qualityScore,
      reliabilityScore: baseline.reliabilityScore,
      consistencyScore: baseline.consistencyScore,
      communityScore: baseline.communityScore,
      totalContributions,
      updatedAt: null,
      explanation: 'Reputation has not been calculated yet; showing a live estimate',
    };
  }

  /**
   * Recalculate and persist a reputation. Idempotent unless `force` is set.
   */
  static async recalculateForUser(userId, options = {}) {
    const prisma = getPrismaClient();

    const {
      reason = 'Reputation recalculated from stored evidence',
      sourceType = 'RECALCULATION',
      sourceId = null,
      force = false,
    } = options;

    const { snapshot, totalContributions, evidence } =
      await ReputationService.calculateForUser(userId);

    const stored = await prisma.reputation.findUnique({ where: { userId } });
    const previousScore = stored?.overallScore ?? 0;

    const componentsChanged =
      !stored ||
      Math.abs(stored.qualityScore - snapshot.qualityScore) >= CHANGE_TOLERANCE ||
      Math.abs(stored.reliabilityScore - snapshot.reliabilityScore) >= CHANGE_TOLERANCE ||
      Math.abs(stored.consistencyScore - snapshot.consistencyScore) >= CHANGE_TOLERANCE ||
      Math.abs(stored.communityScore - snapshot.communityScore) >= CHANGE_TOLERANCE ||
      stored.totalContributions !== totalContributions;

    const overallChanged =
      !stored || Math.abs(stored.overallScore - snapshot.overallScore) >= CHANGE_TOLERANCE;

    if (!force && !componentsChanged && !overallChanged) {
      return {
        changed: false,
        idempotent: true,
        reputation: stored,
        snapshot,
        evidence,
        message: 'No new evidence; reputation unchanged',
      };
    }

    const safeSourceId = sourceId && UUID_PATTERN.test(String(sourceId)) ? String(sourceId) : null;
    const changeAmount = Math.round((snapshot.overallScore - previousScore) * 100) / 100;

    const result = await prisma.$transaction(async (tx) => {
      const reputation = await tx.reputation.upsert({
        where: { userId },
        create: {
          userId,
          overallScore: snapshot.overallScore,
          qualityScore: snapshot.qualityScore,
          reliabilityScore: snapshot.reliabilityScore,
          consistencyScore: snapshot.consistencyScore,
          communityScore: snapshot.communityScore,
          totalContributions,
        },
        update: {
          overallScore: snapshot.overallScore,
          qualityScore: snapshot.qualityScore,
          reliabilityScore: snapshot.reliabilityScore,
          consistencyScore: snapshot.consistencyScore,
          communityScore: snapshot.communityScore,
          totalContributions,
        },
      });

      // Keep a permanent record of every score movement.
      const history = await tx.reputationHistory.create({
        data: {
          userId,
          previousScore,
          newScore: snapshot.overallScore,
          changeAmount,
          reason,
          sourceType,
          sourceId: safeSourceId,
        },
      });

      return { reputation, history };
    });

    return {
      changed: true,
      idempotent: false,
      reputation: result.reputation,
      history: result.history,
      snapshot,
      evidence,
    };
  }

  /**
   * Recalculate as a side effect of another module's action.
   * A reputation problem must never roll back the action that triggered it, so
   * failures are logged and reported, not thrown.
   */
  static async recalculateAfterEvent(userId, options = {}) {
    try {
      return await ReputationService.recalculateForUser(userId, options);
    } catch (error) {
      logger.warn(
        `Reputation recalculation failed for user ${userId}: ${error.message}`
      );
      return { changed: false, error: error.message };
    }
  }

  /**
   * Paginated reputation history.
   */
  static async getHistory(userId, query = {}) {
    const prisma = getPrismaClient();
    const { page, limit, skip } = parsePagination(query);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    const [items, total] = await Promise.all([
      prisma.reputationHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.reputationHistory.count({ where: { userId } }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Score breakdown with the exact weights used, for transparency screens.
   */
  static async getBreakdown(userId) {
    const prisma = getPrismaClient();

    const { snapshot, totalContributions, evidence } =
      await ReputationService.calculateForUser(userId);

    const stored = await prisma.reputation.findUnique({ where: { userId } });

    return {
      userId,
      overallScore: snapshot.overallScore,
      storedOverallScore: stored?.overallScore ?? null,
      lastCalculatedAt: stored?.updatedAt ?? null,
      totalContributions,
      weights: snapshot.weights,
      normalizedWeights: snapshot.normalizedWeights,
      components: snapshot.components,
      misconductPenalty: snapshot.misconductPenalty,
      breakdown: snapshot.breakdown,
      explanation: snapshot.explanation,
      evidence,
    };
  }
}

export default ReputationService;
