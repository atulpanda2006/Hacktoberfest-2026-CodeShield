import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';
import { parsePagination } from '../../../utils/pagination.js';
import { canTransition } from '../../../utils/contributionStatus.js';
import { ReputationService } from '../../reputation/services/reputationService.js';

/**
 * DisputeService — reporting and resolving suspicious contributions (Module 11).
 *
 * Central rule: filing a dispute never penalizes the contributor. A dispute
 * only marks the contribution as DISPUTED (pausing reviews and reputation
 * movement for that item). Consequences are applied exclusively when an
 * authorized reviewer records a documented resolution.
 */

const DISPUTE_SELECT = {
  id: true,
  contributionId: true,
  reportedBy: true,
  reason: true,
  description: true,
  evidence: true,
  status: true,
  resolution: true,
  resolvedBy: true,
  previousContributionStatus: true,
  createdAt: true,
  updatedAt: true,
  reporter: { select: { id: true, username: true, role: true } },
  resolver: { select: { id: true, username: true, role: true } },
  contribution: {
    select: {
      id: true,
      title: true,
      status: true,
      githubPRUrl: true,
      contributorId: true,
      repository: { select: { id: true, fullName: true } },
    },
  },
};

const DISPUTE_TRANSITIONS = {
  OPEN: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['RESOLVED', 'REJECTED'],
  RESOLVED: ['APPEALED'],
  APPEALED: ['UNDER_REVIEW', 'RESOLVED', 'REJECTED'],
  REJECTED: [],
};

/** Statuses that are considered an open, active dispute. */
const ACTIVE_DISPUTE_STATUSES = ['OPEN', 'UNDER_REVIEW', 'APPEALED'];

export class DisputeService {
  /**
   * File a dispute against a contribution.
   */
  static async createDispute(reporter, data) {
    const prisma = getPrismaClient();

    const contribution = await prisma.contribution.findUnique({
      where: { id: data.contributionId },
      select: {
        id: true,
        title: true,
        status: true,
        contributorId: true,
        repositoryId: true,
        repository: { select: { id: true, fullName: true } },
      },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    if (contribution.contributorId === reporter.id) {
      throw AppError.forbidden(
        'You cannot dispute your own contribution. Use an appeal against a resolved outcome instead.'
      );
    }

    const existing = await prisma.dispute.findFirst({
      where: {
        contributionId: contribution.id,
        reportedBy: reporter.id,
        status: { in: ACTIVE_DISPUTE_STATUSES },
      },
      select: { id: true, status: true },
    });

    if (existing) {
      throw AppError.conflict('You already have an active dispute for this contribution');
    }

    const shouldMarkDisputed =
      contribution.status !== 'DISPUTED' && canTransition(contribution.status, 'DISPUTED');

    const dispute = await prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          contributionId: contribution.id,
          reportedBy: reporter.id,
          reason: data.reason,
          description: data.description,
          evidence: data.evidence ?? null,
          status: 'OPEN',
          previousContributionStatus: shouldMarkDisputed ? contribution.status : null,
        },
        select: DISPUTE_SELECT,
      });

      if (shouldMarkDisputed) {
        await tx.contribution.update({
          where: { id: contribution.id },
          data: { status: 'DISPUTED' },
        });
      }

      return created;
    });

    return dispute;
  }

  /**
   * Dispute detail.
   */
  static async getDisputeById(disputeId) {
    const prisma = getPrismaClient();

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      select: DISPUTE_SELECT,
    });

    if (!dispute) {
      throw AppError.notFound('Dispute not found');
    }

    return dispute;
  }

  /**
   * Disputes filed against a contribution.
   */
  static async getDisputesForContribution(contributionId, query = {}) {
    const prisma = getPrismaClient();
    const { page, limit, skip } = parsePagination(query);

    const contribution = await prisma.contribution.findUnique({
      where: { id: contributionId },
      select: { id: true },
    });

    if (!contribution) {
      throw AppError.notFound('Contribution not found');
    }

    const where = {
      contributionId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: DISPUTE_SELECT,
      }),
      prisma.dispute.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Disputes the caller filed or resolved.
   */
  static async getMyDisputes(user, query = {}) {
    const prisma = getPrismaClient();
    const { page, limit, skip } = parsePagination(query);

    const where = {
      OR: [{ reportedBy: user.id }, { resolvedBy: user.id }],
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: DISPUTE_SELECT,
      }),
      prisma.dispute.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Move a dispute through its lifecycle and, where authorized, apply the
   * documented outcome to the contribution.
   */
  static async updateStatus(disputeId, user, data) {
    const prisma = getPrismaClient();

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      select: {
        id: true,
        status: true,
        contributionId: true,
        reportedBy: true,
        previousContributionStatus: true,
        contribution: {
          select: { id: true, status: true, contributorId: true, title: true },
        },
      },
    });

    if (!dispute) {
      throw AppError.notFound('Dispute not found');
    }

    if (!(DISPUTE_TRANSITIONS[dispute.status] ?? []).includes(data.status)) {
      throw AppError.conflict(
        `Invalid dispute status transition: ${dispute.status} -> ${data.status}`
      );
    }

    DisputeService.assertCanChangeStatus(dispute, user, data.status);

    let contributionStatus = null;
    let nextContributionStatus = null;

    if (data.status === 'RESOLVED' || data.status === 'REJECTED') {
      // An explicit outcome for the contribution is only honoured when supplied.
      if (data.contributionStatus) {
        contributionStatus = data.contributionStatus;
        nextContributionStatus = data.contributionStatus;
      } else if (data.status === 'REJECTED') {
        // Dismissed dispute: restore the contribution to where it was.
        nextContributionStatus = dispute.previousContributionStatus ?? 'VERIFIED';
      }
    }

    if (data.status === 'APPEALED') {
      nextContributionStatus = 'DISPUTED';
    }

    if (nextContributionStatus && dispute.contribution.status !== nextContributionStatus) {
      const allowed =
        nextContributionStatus === 'DISPUTED'
          ? true // appeals always re-flag the contribution
          : canTransition(dispute.contribution.status, nextContributionStatus);

      if (!allowed) {
        throw AppError.conflict(
          `Cannot move the contribution from ${dispute.contribution.status} to ${nextContributionStatus}`
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: data.status,
          ...(data.resolution !== undefined ? { resolution: data.resolution } : {}),
          ...(['RESOLVED', 'REJECTED'].includes(data.status)
            ? { resolvedBy: user.id }
            : {}),
        },
        select: DISPUTE_SELECT,
      });

      if (nextContributionStatus && nextContributionStatus !== dispute.contribution.status) {
        await tx.contribution.update({
          where: { id: dispute.contributionId },
          data: { status: nextContributionStatus },
        });
      }

      return record;
    });

    // Reputation consequences occur only after an authorized resolution.
    if (['RESOLVED', 'REJECTED'].includes(data.status)) {
      await ReputationService.recalculateAfterEvent(dispute.contribution.contributorId, {
        reason: `Dispute ${data.status.toLowerCase()} for contribution "${dispute.contribution.title}"`,
        sourceType: 'DISPUTE',
        sourceId: dispute.id,
      });
    }

    return updated;
  }

  /**
   * Permission model:
   *  - taking a dispute under review: REVIEWER, MAINTAINER, ADMIN
   *  - resolving/rejecting: REVIEWER or ADMIN (documented resolution required)
   *  - appealing: the reporter or the contribution's contributor
   */
  static assertCanChangeStatus(dispute, user, nextStatus) {
    const isAdmin = user.role === 'ADMIN';
    const isReviewer = ['REVIEWER', 'MAINTAINER'].includes(user.role);
    const isInvolved =
      user.id === dispute.reportedBy || user.id === dispute.contribution.contributorId;

    if (isAdmin) return;

    if (nextStatus === 'UNDER_REVIEW') {
      if (isReviewer) return;
      throw AppError.forbidden('Only reviewers or administrators can take a dispute under review');
    }

    if (['RESOLVED', 'REJECTED'].includes(nextStatus)) {
      // Only dedicated reviewers decide outcomes; maintainers may triage.
      if (user.role === 'REVIEWER') return;
      throw AppError.forbidden('Only reviewers or administrators can resolve a dispute');
    }

    if (nextStatus === 'APPEALED') {
      if (isInvolved || isReviewer) return;
      throw AppError.forbidden('Only involved parties, reviewers, or administrators can appeal');
    }
  }
}

export default DisputeService;
