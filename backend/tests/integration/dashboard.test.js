import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;
const admin = TEST_USERS.admin;

describe('Dashboard Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, dev);
  });

  describe('GET /api/v1/dashboard/developer', () => {
    it('returns reputation, contribution counts, reviews and trust', async () => {
      prisma.reputation.findUnique.mockResolvedValue({
        overallScore: 61.5,
        qualityScore: 70,
        reliabilityScore: 60,
        consistencyScore: 50,
        communityScore: 60,
        totalContributions: 3,
        updatedAt: new Date(),
      });
      prisma.contribution.groupBy.mockResolvedValue([
        { status: 'APPROVED', _count: { _all: 2 } },
        { status: 'VERIFIED', _count: { _all: 1 } },
      ]);
      prisma.contribution.count.mockResolvedValue(3);
      prisma.review.findMany.mockImplementation(async () => []);
      prisma.dispute.count.mockResolvedValue(1);
      prisma.repositoryMember.count.mockResolvedValue(2);
      prisma.trustRelationship.count.mockResolvedValue(1);
      prisma.trustRelationship.aggregate.mockResolvedValue({ _avg: { trustLevel: 4 } });

      const res = await request(app)
        .get('/api/v1/dashboard/developer')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      const dashboard = res.body.data.dashboard;
      expect(dashboard.reputation.overallScore).toBe(61.5);
      expect(dashboard.contributions).toMatchObject({
        total: 3,
        verified: 3,
        byStatus: { APPROVED: 2, VERIFIED: 1 },
      });
      expect(dashboard.openDisputes).toBe(1);
      expect(dashboard.trust).toEqual({ given: 1, received: 1, averageReceivedLevel: 4 });
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/dashboard/developer');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/dashboard/maintainer', () => {
    it('returns an empty summary when the user maintains nothing', async () => {
      prisma.repositoryMember.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/dashboard/maintainer')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.dashboard.summary).toEqual({
        repositories: 0,
        awaitingReview: 0,
        contributions: 0,
      });
    });

    it('returns the review queue for maintained repositories', async () => {
      prisma.repositoryMember.findMany.mockResolvedValue([
        {
          role: 'OWNER',
          repository: {
            id: 'repo-1',
            name: 'repo',
            fullName: 'owner/repo',
            primaryLanguage: 'JavaScript',
            stars: 5,
            _count: { contributions: 4, members: 2 },
          },
        },
      ]);
      prisma.contribution.findMany.mockResolvedValue([
        { id: 'c1', title: 'Fix', status: 'VERIFIED', contributor: { id: dev.id, username: 'devone' } },
      ]);
      prisma.contribution.groupBy.mockResolvedValue([
        { status: 'VERIFIED', _count: { _all: 1 } },
        { status: 'APPROVED', _count: { _all: 2 } },
      ]);
      prisma.dispute.count.mockResolvedValue(2);
      prisma.review.findMany.mockResolvedValue([]);
      prisma.contribution.count.mockResolvedValue(3);

      const res = await request(app)
        .get('/api/v1/dashboard/maintainer')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.dashboard.summary).toEqual({
        repositories: 1,
        contributions: 3,
        awaitingReview: 1,
      });
      expect(res.body.data.dashboard.openDisputes).toBe(2);
      expect(res.body.data.dashboard.reviewQueue).toHaveLength(1);
    });
  });

  describe('GET /api/v1/dashboard/admin', () => {
    it('forbids non-administrators', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/admin')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(403);
    });

    it('returns platform-wide aggregates for an administrator', async () => {
      mockRequester(prisma, admin);
      prisma.user.groupBy.mockResolvedValue([{ role: 'DEVELOPER', _count: { _all: 5 } }]);
      prisma.user.count.mockResolvedValue(6);
      prisma.repository.count.mockResolvedValue(2);
      prisma.contribution.groupBy.mockResolvedValue([
        { status: 'APPROVED', _count: { _all: 4 } },
        { status: 'DISPUTED', _count: { _all: 1 } },
      ]);
      prisma.contribution.count.mockResolvedValue(5);
      prisma.dispute.groupBy.mockResolvedValue([{ status: 'OPEN', _count: { _all: 1 } }]);
      prisma.dispute.count.mockResolvedValue(1);
      prisma.aIAnalysis.groupBy.mockResolvedValue([
        { analysisStatus: 'COMPLETED', _count: { _all: 3 } },
      ]);
      prisma.reputation.aggregate.mockResolvedValue({
        _avg: { overallScore: 55 },
        _count: { _all: 2 },
      });
      prisma.dispute.findMany.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/v1/dashboard/admin')
        .set('Authorization', bearer(admin));

      expect(res.status).toBe(200);
      const dashboard = res.body.data.dashboard;
      expect(dashboard.users).toEqual({ total: 6, byRole: { DEVELOPER: 5 } });
      expect(dashboard.contributions.byStatus).toMatchObject({ APPROVED: 4, DISPUTED: 1 });
      expect(dashboard.reputation).toEqual({
        calculatedProfiles: 2,
        averageOverallScore: 55,
      });
    });
  });

  describe('GET /api/v1/dashboard/statistics', () => {
    it('is public and returns aggregate counters', async () => {
      prisma.user.count.mockResolvedValue(10);
      prisma.repository.count.mockResolvedValue(3);
      prisma.contribution.groupBy.mockResolvedValue([
        { status: 'APPROVED', _count: { _all: 2 } },
        { status: 'VERIFIED', _count: { _all: 1 } },
        { status: 'REJECTED', _count: { _all: 1 } },
      ]);
      prisma.contribution.count.mockResolvedValue(4);
      prisma.dispute.groupBy.mockResolvedValue([{ status: 'OPEN', _count: { _all: 1 } }]);
      prisma.reputation.aggregate.mockResolvedValue({
        _avg: { overallScore: 42.5 },
        _count: { _all: 4 },
      });
      prisma.repository.groupBy.mockResolvedValue([
        { primaryLanguage: 'JavaScript', _count: { _all: 2 } },
      ]);

      const res = await request(app).get('/api/v1/dashboard/statistics');

      expect(res.status).toBe(200);
      expect(res.body.data.statistics.contributions).toMatchObject({
        total: 4,
        verified: 3,
        approved: 2,
        rejected: 1,
      });
      expect(res.body.data.statistics.topLanguages).toEqual([
        { language: 'JavaScript', repositories: 2 },
      ]);
    });
  });
});
