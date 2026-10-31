import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';
import { parsePagination } from '../../../utils/pagination.js';
import { canTransition } from '../../../utils/contributionStatus.js';
import { ReputationService } from '../../reputation/services/reputationService.js';

/**
 * ReviewService — community review of verified contributions (Module 10).
 *
 * Reviews are human judgments recorded with reviewer identity. They feed the
 * "community validation" component of reputation but never change a score
 * directly: the reputation engine recomputes from stored decisions.
 */

const REVIEW_SELECT = {
  id: true,
  contributionId: true,
  reviewerId: true,
  decision: true,
  rating: true,
  comments: true,
  createdAt: true,
  updatedAt: true,
  reviewer: { select: { id: true, username: true, role: true } },
};

/** Contributions can only be reviewed once authenticity is established. */
const REVIEWABLE_STATUSES = ['VERIFIED', 'UNDER_AI_ANALYSIS', 'UNDER_COMMUNITY_REVIEW'];

const FINAL_STATUSES = ['APPROVED', 'REJECTED'];

export class ReviewService {
  /**
   * Submit a review for a contribution.
   */
  static async createReview(reviewer, data) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: data.contributionId },
      select: {
        id: true,
        title: true,
        status: true,
        contributorId: true,
        repositoryId: true,
      },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    if (contribution.contributorId === reviewer.id) {
      throw AppError.forbidden('You cannot review your own contribution');
    }

    await ReviewService.assertCanReview(contribution, reviewer);

    if (FINAL_STATUSES.includes(contribution.status)) {
      throw AppError.conflict('This contribution has already been finalised and cannot be reviewed');
    }

    if (!REVIEWABLE_STATUSES.includes(contribution.status)) {
      throw AppError.conflict(
        'This contribution must be verified before it can be reviewed'
      );
    }

    const existing = await prisma.review.findUnique({
      where: {
        contributionId_reviewerId: {
          contributionId: contribution.id,
          reviewerId: reviewer.id,
        },
      },
      select: { id: true },
    });

    if (existing) {
      throw AppError.conflict(
        'You have already reviewed this contribution. Update your existing review instead.'
      );
    }

    const review = await prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          contributionId: contribution.id,
          reviewerId: reviewer.id,
          decision: data.decision,
          rating: data.rating ?? null,
          comments: data.comments ?? null,
        },
        select: REVIEW_SELECT,
      });

      // A review moves an authentic contribution into community review.
      if (canTransition(contribution.status, 'UNDER_COMMUNITY_REVIEW')) {
        await tx.contribution.update({
          where: { id: contribution.id },
          data: { status: 'UNDER_COMMUNITY_REVIEW' },
        });
      }

      return created;
    });

    await ReputationService.recalculateAfterEvent(contribution.contributorId, {
      reason: `Review ${data.decision} submitted for contribution ${contribution.id}`,
      sourceType: 'REVIEW',
      sourceId: review.id,
    });

    return review;
  }

  /**
   * Update an existing review. The reviewer (or ADMIN) may revise a decision.
   */
  static async updateReview(reviewId, user, data) {
    const prisma = getPrismaClient();

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        reviewerId: true,
        contributionId: true,
        contribution: { select: { status: true, contributorId: true } },
      },
    });

    if (!review) {
      throw AppError.notFound('Review not found');
    }

    if (review.reviewerId !== user.id && user.role !== 'ADMIN') {
      throw AppError.forbidden('Only the reviewer who created this review can update it');
    }

    if (FINAL_STATUSES.includes(review.contribution.status) && user.role !== 'ADMIN') {
      throw AppError.conflict('This contribution has already been finalised');
    }

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data,
      select: REVIEW_SELECT,
    });

    await ReputationService.recalculateAfterEvent(review.contribution.contributorId, {
      reason: `Review updated for contribution ${review.contributionId}`,
      sourceType: 'REVIEW',
      sourceId: reviewId,
    });

    return updated;
  }

  /**
   * Reviews for a contribution with an aggregate summary.
   */
  static async getContributionReviews(contributionId, query = {}) {
    const prisma = getPrismaClient();
    const { page, limit, skip } = parsePagination(query);

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: { id: true, status: true, contributorId: true },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    const where = { contributionId, ...(query.decision ? { decision: query.decision } : {}) };

    const [items, total, all] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: REVIEW_SELECT,
      }),
      prisma.review.count({ where }),
      prisma.review.findMany({
        where: { contributionId },
        select: { decision: true, rating: true },
      }),
    ]);

    const counts = all.reduce(
      (acc, review) => {
        acc[review.decision] = (acc[review.decision] ?? 0) + 1;
        return acc;
      },
      { APPROVE: 0, REQUEST_CHANGES: 0, REJECT: 0 }
    );

    const rated = all.filter((review) => typeof review.rating === 'number');

    return {
      items,
      total,
      page,
      limit,
      summary: {
        ...counts,
        totalReviews: all.length,
        averageRating: rated.length
          ? Math.round((rated.reduce((sum, review) => sum + review.rating, 0) / rated.length) * 100) / 100
          : null,
      },
    };
  }

  /**
   * Reviews written by the caller.
   */
  static async getMyReviews(user, query = {}) {
    const prisma = getPrismaClient();
    const { page, limit, skip } = parsePagination(query);

    const where = { reviewerId: user.id, ...(query.decision ? { decision: query.decision } : {}) };

    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          ...REVIEW_SELECT,
          contribution: {
            select: {
              id: true,
              title: true,
              status: true,
              githubPRUrl: true,
              contributor: { select: { id: true, username: true } },
            },
          },
        },
      }),
      prisma.review.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Reviewers must be platform REVIEWER/MAINTAINER/ADMIN or a repository
   * OWNER/MAINTAINER member.
   */
  static async assertCanReview(contribution, user) {
    if (['ADMIN', 'REVIEWER', 'MAINTAINER'].includes(user.role)) return;

    const prisma = getPrismaClient();
    const membership = await prisma.repositoryMember.findUnique({
      where: {
        repositoryId_userId: {
          repositoryId: contribution.repositoryId,
          userId: user.id,
        },
      },
      select: { role: true },
    });

    if (['OWNER', 'MAINTAINER'].includes(membership?.role)) return;

    throw AppError.forbidden('Only maintainers and reviewers can review contributions');
  }
}

export default ReviewService;
