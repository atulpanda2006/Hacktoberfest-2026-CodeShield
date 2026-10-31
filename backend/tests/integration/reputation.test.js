import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';
import { computeReputation } from '../../src/modules/reputation/services/reputationEngine.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;
const admin = TEST_USERS.admin;
const OTHER_ID = '88888888-8888-4888-8888-888888888888';

const storedReputation = {
  userId: dev.id,
  overallScore: 72,
  qualityScore: 80,
  reliabilityScore: 70,
  consistencyScore: 60,
  communityScore: 75,
  totalContributions: 4,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

describe('Reputation Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, dev);
  });

  describe('GET /api/v1/reputation/me', () => {
    it('returns the stored reputation', async () => {
      prisma.reputation.findUnique.mockResolvedValue(storedReputation);

      const res = await request(app)
        .get('/api/v1/reputation/me')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.reputation).toMatchObject({
        initialized: true,
        overallScore: 72,
        totalContributions: 4,
      });
    });

    it('returns a live estimate when no reputation has been persisted', async () => {
      prisma.reputation.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/reputation/me')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.reputation.initialized).toBe(false);
      expect(res.body.data.reputation.overallScore).toBe(0);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/reputation/me');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/reputation/:userId', () => {
    it('computes a live estimate from stored evidence when unpersisted', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: OTHER_ID, username: 'other' });
      prisma.reputation.findUnique.mockResolvedValue(null);
      prisma.contribution.findMany.mockResolvedValue([
        { id: 'c1', status: 'APPROVED', submittedAt: new Date() },
      ]);

      const res = await request(app).get(`/api/v1/reputation/${OTHER_ID}`);

      const expected = computeReputation({
        submittedContributions: 1,
        verifiedContributions: 1,
        aiQualityScores: [],
        activeMonthsLast6: 1,
        reviewDecisions: { APPROVE: 0, REQUEST_CHANGES: 0, REJECT: 0 },
        confirmedMisconductCount: 0,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.reputation.initialized).toBe(false);
      expect(res.body.data.reputation.overallScore).toBe(expected.overallScore);
    });

    it('returns 404 for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/reputation/${OTHER_ID}`);

      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed user id', async () => {
      const res = await request(app).get('/api/v1/reputation/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/reputation/:userId/breakdown', () => {
    it('explains every component and the weights used', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: dev.id, username: dev.username });
      prisma.contribution.findMany.mockResolvedValue([
        { id: 'c1', status: 'VERIFIED', submittedAt: new Date() },
        { id: 'c2', status: 'REJECTED', submittedAt: new Date() },
      ]);
      prisma.review.findMany.mockResolvedValue([{ decision: 'APPROVE' }, { decision: 'REJECT' }]);
      prisma.aIAnalysis.findMany.mockResolvedValue([{ qualityScore: 90 }]);
      prisma.reputation.findUnique.mockResolvedValue(storedReputation);

      const res = await request(app).get(`/api/v1/reputation/${dev.id}/breakdown`);

      expect(res.status).toBe(200);
      const { breakdown } = res.body.data;
      expect(breakdown.weights).toEqual({
        quality: 0.35,
        reliability: 0.25,
        consistency: 0.15,
        community: 0.15,
        impact: 0.1,
      });
      expect(breakdown.components).toMatchObject({
        quality: 90,
        reliability: 50,
        community: 50,
        impact: 10,
      });
      expect(breakdown.breakdown).toHaveLength(5);
      expect(breakdown.explanation).toContain('available signal');
    });
  });

  describe('GET /api/v1/reputation/:userId/history', () => {
    it('returns paginated history', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: dev.id });
      prisma.reputationHistory.findMany.mockResolvedValue([
        { id: 'h1', previousScore: 60, newScore: 72, changeAmount: 12 },
      ]);
      prisma.reputationHistory.count.mockResolvedValue(1);

      const res = await request(app).get(`/api/v1/reputation/${dev.id}/history`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      expect(res.body.data[0].changeAmount).toBe(12);
    });
  });

  describe('POST /api/v1/reputation/recalculate/:userId', () => {
    it('persists a new score and appends history', async () => {
      prisma.contribution.findMany.mockResolvedValue([
        { id: 'c1', status: 'APPROVED', submittedAt: new Date() },
      ]);
      prisma.reputation.findUnique.mockResolvedValue(null);
      prisma.reputation.upsert.mockResolvedValue({ ...storedReputation, overallScore: 23.33 });
      prisma.reputationHistory.create.mockResolvedValue({
        id: 'h1',
        previousScore: 0,
        newScore: 23.33,
        changeAmount: 23.33,
      });

      const res = await request(app)
        .post(`/api/v1/reputation/recalculate/${dev.id}`)
        .set('Authorization', bearer(dev))
        .send({ reason: 'Quarterly review' });

      expect(res.status).toBe(200);
      expect(res.body.data.result.changed).toBe(true);

      const historyArgs = prisma.reputationHistory.create.mock.calls[0][0];
      expect(historyArgs.data).toMatchObject({
        userId: dev.id,
        previousScore: 0,
        reason: 'Quarterly review',
        sourceType: 'MANUAL_RECALCULATION',
      });
      expect(historyArgs.data.changeAmount).toBe(historyArgs.data.newScore);
    });

    it('is idempotent when nothing changed', async () => {
      // No contributions, no analyses, no reviews: snapshot is all zeros.
      prisma.reputation.findUnique.mockResolvedValue({
        overallScore: 0,
        qualityScore: 0,
        reliabilityScore: 0,
        consistencyScore: 0,
        communityScore: 0,
        totalContributions: 0,
      });

      const res = await request(app)
        .post(`/api/v1/reputation/recalculate/${dev.id}`)
        .set('Authorization', bearer(dev))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.result.changed).toBe(false);
      expect(res.body.data.result.idempotent).toBe(true);
      expect(prisma.reputationHistory.create).not.toHaveBeenCalled();
      expect(prisma.reputation.upsert).not.toHaveBeenCalled();
    });

    it('forbids recalculating another developer', async () => {
      const res = await request(app)
        .post(`/api/v1/reputation/recalculate/${OTHER_ID}`)
        .set('Authorization', bearer(dev))
        .send({});

      expect(res.status).toBe(403);
    });

    it('allows an administrator to recalculate any developer', async () => {
      prisma.user.findUnique.mockImplementation(async ({ where }) => {
        if (where.id === admin.id) return admin;
        if (where.id === OTHER_ID) return { id: OTHER_ID, username: 'other' };
        return null;
      });
      prisma.reputation.findUnique.mockResolvedValue(null);
      prisma.reputation.upsert.mockResolvedValue({ ...storedReputation, userId: OTHER_ID });
      prisma.reputationHistory.create.mockResolvedValue({ id: 'h2' });

      const res = await request(app)
        .post(`/api/v1/reputation/recalculate/${OTHER_ID}`)
        .set('Authorization', bearer(admin))
        .send({ force: true });

      expect(res.status).toBe(200);
      expect(prisma.reputation.upsert).toHaveBeenCalled();
    });
  });
});
