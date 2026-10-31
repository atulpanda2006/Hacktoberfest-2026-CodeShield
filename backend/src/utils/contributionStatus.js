/**
 * Contribution status state machine.
 *
 * Status changes are explicit and auditable. Any transition not listed here is
 * rejected, which prevents a contribution from jumping straight from
 * SUBMITTED to APPROVED without verification, AI analysis, or review.
 */

export const CONTRIBUTION_STATUSES = [
  'SUBMITTED',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'UNDER_AI_ANALYSIS',
  'UNDER_COMMUNITY_REVIEW',
  'APPROVED',
  'REJECTED',
  'DISPUTED',
];

/**
 * Allowed transitions per current status.
 */
export const ALLOWED_TRANSITIONS = {
  SUBMITTED: ['PENDING_VERIFICATION', 'DISPUTED'],
  PENDING_VERIFICATION: ['VERIFIED', 'SUBMITTED', 'DISPUTED'],
  VERIFIED: ['UNDER_AI_ANALYSIS', 'UNDER_COMMUNITY_REVIEW', 'APPROVED', 'DISPUTED'],
  UNDER_AI_ANALYSIS: ['VERIFIED', 'UNDER_COMMUNITY_REVIEW', 'DISPUTED'],
  UNDER_COMMUNITY_REVIEW: ['APPROVED', 'REJECTED', 'DISPUTED'],
  APPROVED: ['DISPUTED'],
  REJECTED: ['DISPUTED'],
  DISPUTED: [
    'UNDER_COMMUNITY_REVIEW',
    'APPROVED',
    'REJECTED',
    'VERIFIED',
    'SUBMITTED',
    'PENDING_VERIFICATION',
  ],
};

/**
 * Statuses a contribution may have when it is considered "authentic" and
 * therefore usable for reputation calculations.
 */
export const TRUSTED_STATUSES = ['VERIFIED', 'UNDER_AI_ANALYSIS', 'UNDER_COMMUNITY_REVIEW', 'APPROVED'];

/**
 * Statuses that represent a closed evaluation outcome.
 */
export const FINAL_STATUSES = ['APPROVED', 'REJECTED'];

export function canTransition(from, to) {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const error = new Error(
      `Invalid contribution status transition: ${from} -> ${to}`
    );
    error.statusCode = 409;
    error.isOperational = true;
    throw error;
  }
}

/**
 * A contributor is only allowed to push their own contribution into the
 * verification queue. Everything else requires a maintainer/reviewer/admin.
 */
export const CONTRIBUTOR_ALLOWED_TARGETS = ['PENDING_VERIFICATION'];

export default {
  CONTRIBUTION_STATUSES,
  ALLOWED_TRANSITIONS,
  TRUSTED_STATUSES,
  FINAL_STATUSES,
  canTransition,
  assertTransition,
  CONTRIBUTOR_ALLOWED_TARGETS,
};
