import {
  computeReputation,
  REPUTATION_WEIGHTS,
  MISCONDUCT_PENALTY_MAX,
} from '../../src/modules/reputation/services/reputationEngine.js';

/**
 * The reputation formula is the core business logic of the platform, so it is
 * tested directly, with no database or HTTP involved.
 */

const baseInput = {
  submittedContributions: 0,
  verifiedContributions: 0,
  aiQualityScores: [],
  activeMonthsLast6: 0,
  reviewDecisions: { APPROVE: 0, REQUEST_CHANGES: 0, REJECT: 0 },
  confirmedMisconductCount: 0,
};

describe('Reputation engine', () => {
  it('returns zero with no evidence at all', () => {
    const result = computeReputation(baseInput);

    expect(result.overallScore).toBe(0);
    expect(result.components.quality).toBeNull();
    expect(result.components.community).toBeNull();
    expect(result.breakdown.every((item) => item.applied === false)).toBe(true);
  });

  it('computes the documented weighted score', () => {
    const result = computeReputation({
      submittedContributions: 4,
      verifiedContributions: 4,
      aiQualityScores: [80],
      activeMonthsLast6: 6,
      reviewDecisions: { APPROVE: 3, REQUEST_CHANGES: 0, REJECT: 1 },
      confirmedMisconductCount: 0,
    });

    expect(result.components).toEqual({
      quality: 80,
      reliability: 100,
      consistency: 100,
      community: 75,
      impact: 40,
    });

    // 80*.35 + 100*.25 + 100*.15 + 75*.15 + 40*.10 = 83.25
    expect(result.overallScore).toBe(83.25);
    expect(result.weights).toEqual(REPUTATION_WEIGHTS);
    expect(result.breakdown).toHaveLength(5);
  });

  it('re-normalizes weights over available signals instead of penalizing missing data', () => {
    const result = computeReputation({
      ...baseInput,
      submittedContributions: 2,
      verifiedContributions: 1,
    });

    // Quality and community have no data and are excluded, while consistency is
    // a real zero (contributions exist, but none in the last six months).
    expect(result.components.quality).toBeNull();
    expect(result.components.community).toBeNull();
    expect(result.components.reliability).toBe(50);
    expect(result.components.consistency).toBe(0);
    expect(result.components.impact).toBe(10);

    const expected = (50 * 0.25 + 0 * 0.15 + 10 * 0.1) / (0.25 + 0.15 + 0.1);
    expect(result.overallScore).toBe(Math.round(expected * 100) / 100);
  });

  it('uses the mean of AI quality scores only (risk flags never enter the score)', () => {
    const result = computeReputation({
      ...baseInput,
      submittedContributions: 1,
      verifiedContributions: 1,
      aiQualityScores: [70, 90],
    });

    expect(result.components.quality).toBe(80);
    expect(result.inputs.aiAnalysesUsed).toBe(2);
  });

  it('lowers reliability when contributions are rejected', () => {
    const good = computeReputation({
      ...baseInput,
      submittedContributions: 10,
      verifiedContributions: 5,
    });
    const better = computeReputation({
      ...baseInput,
      submittedContributions: 10,
      verifiedContributions: 9,
    });

    expect(good.components.reliability).toBe(50);
    expect(better.components.reliability).toBe(90);
    expect(better.overallScore).toBeGreaterThan(good.overallScore);
  });

  it('caps consistency at six active months', () => {
    const result = computeReputation({
      ...baseInput,
      submittedContributions: 1,
      verifiedContributions: 1,
      activeMonthsLast6: 12,
    });

    expect(result.components.consistency).toBe(100);
  });

  it('caps impact so contribution volume alone cannot dominate', () => {
    const result = computeReputation({
      ...baseInput,
      submittedContributions: 50,
      verifiedContributions: 50,
    });

    expect(result.components.impact).toBe(100);

    const modest = computeReputation({
      ...baseInput,
      submittedContributions: 5,
      verifiedContributions: 5,
    });
    expect(modest.components.impact).toBe(50);
  });

  it('applies a documented penalty for confirmed misconduct', () => {
    const clean = computeReputation({
      submittedContributions: 10,
      verifiedContributions: 10,
      aiQualityScores: [100],
      activeMonthsLast6: 6,
      reviewDecisions: { APPROVE: 5, REQUEST_CHANGES: 0, REJECT: 0 },
    });

    const penalized = computeReputation({
      submittedContributions: 10,
      verifiedContributions: 10,
      aiQualityScores: [100],
      activeMonthsLast6: 6,
      reviewDecisions: { APPROVE: 5, REQUEST_CHANGES: 0, REJECT: 0 },
      confirmedMisconductCount: 2,
    });

    expect(clean.overallScore).toBe(100);
    expect(penalized.misconductPenalty).toBe(20);
    expect(penalized.overallScore).toBe(80);
  });

  it('caps the misconduct penalty', () => {
    const result = computeReputation({
      ...baseInput,
      submittedContributions: 1,
      verifiedContributions: 1,
      confirmedMisconductCount: 10,
    });

    expect(result.misconductPenalty).toBe(MISCONDUCT_PENALTY_MAX);
    // reliability 100, consistency 0, impact 10 -> weighted 52 before penalty
    expect(result.overallScore).toBe(22);
  });

  it('never returns a score outside 0-100', () => {
    const result = computeReputation({
      submittedContributions: 1000,
      verifiedContributions: 1000,
      aiQualityScores: [100, 100],
      activeMonthsLast6: 6,
      reviewDecisions: { APPROVE: 1000, REQUEST_CHANGES: 0, REJECT: 0 },
      confirmedMisconductCount: 0,
    });

    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('rounds scores to two decimals', () => {
    const result = computeReputation({
      submittedContributions: 3,
      verifiedContributions: 1,
      activeMonthsLast6: 1,
    });

    // reliability 33.33, consistency 16.67, impact 10
    expect(result.components.reliability).toBe(33.33);
    expect(result.overallScore).toBeCloseTo(23.67, 2);
  });
});
