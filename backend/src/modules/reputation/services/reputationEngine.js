/**
 * Reputation engine (Module 8) — pure, deterministic, explainable scoring.
 *
 * The engine is intentionally separated from all database access so the formula
 * can be unit-tested directly and audited by anyone reading this file.
 *
 * ---------------------------------------------------------------------------
 * FORMULA (provisional weights, evaluated before finalizing)
 * ---------------------------------------------------------------------------
 *   overall = Σ (weight_i × component_i) / Σ weight_i   − misconductPenalty
 *
 * Only components with real evidence take part: the weights are re-normalized
 * over the available signals, so a developer is never punished for the absence
 * of an input (for example, no community reviews yet).
 *
 *   quality      35%   mean AI qualityScore of completed analyses on authentic
 *                      contributions. AI *risk* flags are deliberately excluded:
 *                      an AI flag alone can never lower a reputation.
 *   reliability  25%   authentic-or-better contributions / submitted * 100.
 *                      A rejected contribution therefore lowers reliability,
 *                      while a disputed (unresolved) one does not.
 *   consistency  15%   distinct months with an authentic contribution in the
 *                      last 6 months / 6 * 100 (capped at 100).
 *   community    15%   approvals / total reviews received * 100. Maintainer and
 *                      reviewer decisions only; self-reviews are impossible.
 *   impact       10%   verified contributions, capped at 100 (10 verified = 100).
 *                      Quantity alone is capped and weighted lowest, so flooding
 *                      the network cannot manufacture a high score.
 *
 *   misconductPenalty = min(30, 10 × confirmed misconduct outcomes), where a
 *   confirmed outcome is a RESOLVED dispute whose contribution ended REJECTED.
 *   Filing a dispute never affects a score; only a documented resolution does.
 *
 * Scores are 0–100, rounded to 2 decimals. Every recalculation is compared with
 * the stored score, so repeating a calculation without new evidence produces no
 * history row (idempotent recalculation).
 */

export const REPUTATION_WEIGHTS = Object.freeze({
  quality: 0.35,
  reliability: 0.25,
  consistency: 0.15,
  community: 0.15,
  impact: 0.1,
});

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;
export const CONSISTENCY_MONTHS = 6;
export const IMPACT_PER_VERIFIED_POINT = 10;
export const MISCONDUCT_PENALTY_PER_CASE = 10;
export const MISCONDUCT_PENALTY_MAX = 30;
export const CHANGE_TOLERANCE = 0.01;

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function clamp(value, min = SCORE_MIN, max = SCORE_MAX) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute a reputation snapshot from aggregated evidence.
 *
 * @param {object} input
 * @param {number} input.submittedContributions - all contributions ever submitted
 * @param {number} input.verifiedContributions - authentic-or-better contributions
 * @param {number[]} input.aiQualityScores - quality scores of completed analyses on authentic contributions
 * @param {number} input.activeMonthsLast6 - distinct months with an authentic contribution in the last 6 months
 * @param {{ APPROVE?: number, REQUEST_CHANGES?: number, REJECT?: number }} input.reviewDecisions
 * @param {number} input.confirmedMisconductCount - resolved disputes ending in rejection
 * @returns {object} snapshot with components, breakdown and explanation
 */
export function computeReputation(input = {}) {
  const submitted = Math.max(0, Number(input.submittedContributions) || 0);
  const verified = Math.max(0, Number(input.verifiedContributions) || 0);
  const activeMonths = Math.max(0, Number(input.activeMonthsLast6) || 0);

  const qualityScores = (input.aiQualityScores ?? []).filter(
    (score) => typeof score === 'number' && Number.isFinite(score)
  );

  const decisions = input.reviewDecisions ?? {};
  const approvals = Math.max(0, Number(decisions.APPROVE) || 0);
  const requestChanges = Math.max(0, Number(decisions.REQUEST_CHANGES) || 0);
  const rejections = Math.max(0, Number(decisions.REJECT) || 0);
  const totalReviews = approvals + requestChanges + rejections;

  const misconduct = Math.max(0, Number(input.confirmedMisconductCount) || 0);

  // ---- individual components ------------------------------------------------
  const qualityScore = qualityScores.length
    ? round2(qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length)
    : null;

  const reliabilityScore = submitted > 0 ? round2((verified / submitted) * 100) : null;

  const consistencyScore =
    submitted > 0
      ? round2(
          Math.min(
            100,
            (Math.min(activeMonths, CONSISTENCY_MONTHS) / CONSISTENCY_MONTHS) * 100
          )
        )
      : null;

  const communityScore = totalReviews > 0 ? round2((approvals / totalReviews) * 100) : null;

  const impactScore = submitted > 0 ? round2(Math.min(100, verified * IMPACT_PER_VERIFIED_POINT)) : null;

  const definitions = [
    {
      key: 'quality',
      weight: REPUTATION_WEIGHTS.quality,
      score: qualityScore,
      reason:
        qualityScore === null
          ? 'No completed AI analysis on an authentic contribution yet'
          : `Mean AI quality score across ${qualityScores.length} analyzed contribution(s)`,
    },
    {
      key: 'reliability',
      weight: REPUTATION_WEIGHTS.reliability,
      score: reliabilityScore,
      reason:
        reliabilityScore === null
          ? 'No contributions submitted yet'
          : `${verified} authentic contribution(s) out of ${submitted} submitted`,
    },
    {
      key: 'consistency',
      weight: REPUTATION_WEIGHTS.consistency,
      score: consistencyScore,
      reason:
        consistencyScore === null
          ? 'No contributions submitted yet'
          : `Active in ${activeMonths} of the last ${CONSISTENCY_MONTHS} months`,
    },
    {
      key: 'community',
      weight: REPUTATION_WEIGHTS.community,
      score: communityScore,
      reason:
        communityScore === null
          ? 'No community reviews received yet'
          : `${approvals} approval(s) from ${totalReviews} review(s)`,
    },
    {
      key: 'impact',
      weight: REPUTATION_WEIGHTS.impact,
      score: impactScore,
      reason:
        impactScore === null
          ? 'No contributions submitted yet'
          : `${verified} verified contribution(s), capped at 100`,
    },
  ];

  const available = definitions.filter((item) => item.score !== null);
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);

  const weightedBase = totalWeight
    ? available.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
    : 0;

  const penalty = Math.min(
    MISCONDUCT_PENALTY_MAX,
    misconduct * MISCONDUCT_PENALTY_PER_CASE
  );

  const overallScore = round2(clamp(weightedBase - penalty));

  const breakdown = definitions.map((item) => {
    const applied = item.score !== null;
    const normalizedWeight = applied && totalWeight ? item.weight / totalWeight : 0;

    return {
      component: item.key,
      score: item.score,
      baseWeight: item.weight,
      normalizedWeight: round2(normalizedWeight * 100) / 100,
      weightedPoints: applied ? round2((item.score ?? 0) * normalizedWeight) : 0,
      applied,
      reason: item.reason,
    };
  });

  const explanation = totalWeight
    ? `Overall ${overallScore}/100 from ${available.length} available signal(s)` +
      (penalty > 0 ? `, minus a misconduct penalty of ${penalty}` : '')
    : 'Not enough evidence to calculate a reputation yet';

  return {
    overallScore,
    qualityScore: qualityScore ?? 0,
    reliabilityScore: reliabilityScore ?? 0,
    consistencyScore: consistencyScore ?? 0,
    communityScore: communityScore ?? 0,
    components: {
      quality: qualityScore,
      reliability: reliabilityScore,
      consistency: consistencyScore,
      community: communityScore,
      impact: impactScore,
    },
    weights: { ...REPUTATION_WEIGHTS },
    normalizedWeights: Object.fromEntries(
      breakdown.map((item) => [item.component, item.normalizedWeight])
    ),
    misconductPenalty: penalty,
    breakdown,
    explanation,
    inputs: {
      submittedContributions: submitted,
      verifiedContributions: verified,
      activeMonthsLast6: activeMonths,
      aiAnalysesUsed: qualityScores.length,
      reviewDecisions: { approvals, requestChanges, rejections, totalReviews },
      confirmedMisconductCount: misconduct,
    },
  };
}

export default { computeReputation, REPUTATION_WEIGHTS };
