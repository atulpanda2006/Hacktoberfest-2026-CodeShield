import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;
const reporterUser = TEST_USERS.otherDeveloper;
const reviewer = TEST_USERS.reviewer;
const maintainer = TEST_USERS.maintainer;

const REPO_ID = '9f9f9f9f-1111-4111-8111-9f9f9f9f9f9f';
const CONTRIBUTION_ID = 'c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0';
const DISPUTE_ID = 'dddddddd-1111-4111-8111-dddddddddddd';

const contribution = {
  id: CONTRIBUTION_ID,
  title: 'Fix the bug',
  status: 'VERIFIED',
  contributorId: dev.id,
  repositoryId: REPO_ID,
  repository: { id: REPO_ID, fullName: 'owner/repo' },
};

const dispute = {
  id: DISPUTE_ID,
  contributionId: CONTRIBUTION_ID,
  reportedBy: reporterUser.id,
  reason: 'Suspicious duplication',
  description: 'This looks copied from another project',
  evidence: null,
  status: 'OPEN',
  resolution: null,
  resolvedBy: null,
  previousContributionStatus: 'VERIFIED',
  createdAt: new Date(),
  updatedAt: new Date(),
  reporter: { id: reporterUser.id, username: reporterUser.username, role: 'DEVELOPER' },
  resolver: null,
  contribution: {
    id: CONTRIBUTION_ID,
    title: 'Fix the bug',
    status: 'DISPUTED',
    contributorId: dev.id,
    repository: { id: REPO_ID, fullName: 'owner/repo' },
  },
};

describe('Disputes Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, reporterUser);
  });

  describe('POST /api/v1/disputes', () => {
    it('files a dispute and marks the contribution as disputed', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.dispute.findFirst.mockResolvedValue(null);
      prisma.dispute.create.mockResolvedValue(dispute);
      prisma.contribution.update.mockResolvedValue({});

      const res = await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', bearer(reporterUser))
        .send({
          contributionId: CONTRIBUTION_ID,
          reason: 'Suspicious duplication',
          description: 'This looks copied from another project',
        });

      expect(res.status).toBe(201);
      expect(prisma.dispute.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reportedBy: reporterUser.id,
            status: 'OPEN',
            previousContributionStatus: 'VERIFIED',
          }),
        })
      );
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DISPUTED' } })
      );
    });

    it('does not change reputation when a dispute is filed', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.dispute.findFirst.mockResolvedValue(null);
      prisma.dispute.create.mockResolvedValue(dispute);

      await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', bearer(reporterUser))
        .send({
          contributionId: CONTRIBUTION_ID,
          reason: 'Suspicious duplication',
          description: 'This looks copied from another project',
        });

      expect(prisma.reputation.upsert).not.toHaveBeenCalled();
      expect(prisma.reputationHistory.create).not.toHaveBeenCalled();
    });

    it('forbids disputing your own contribution', async () => {
      mockRequester(prisma, dev);
      prisma.contribution.findUnique.mockResolvedValue(contribution);

      const res = await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', bearer(dev))
        .send({
          contributionId: CONTRIBUTION_ID,
          reason: 'My own dispute',
          description: 'Trying to dispute myself',
        });

      expect(res.status).toBe(403);
    });

    it('refuses a duplicate active dispute by the same reporter', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.dispute.findFirst.mockResolvedValue({ id: DISPUTE_ID, status: 'OPEN' });

      const res = await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', bearer(reporterUser))
        .send({
          contributionId: CONTRIBUTION_ID,
          reason: 'Suspicious duplication',
          description: 'This looks copied from another project',
        });

      expect(res.status).toBe(409);
    });

    it('validates the dispute payload', async () => {
      const res = await request(app)
        .post('/api/v1/disputes')
        .set('Authorization', bearer(reporterUser))
        .send({ contributionId: CONTRIBUTION_ID, reason: 'x', description: 'short' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/disputes', () => {
    it('returns a dispute by id', async () => {
      prisma.dispute.findUnique.mockResolvedValue(dispute);

      const res = await request(app).get(`/api/v1/disputes/${DISPUTE_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.data.dispute.status).toBe('OPEN');
    });

    it('returns 404 for an unknown dispute', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/disputes/${DISPUTE_ID}`);

      expect(res.status).toBe(404);
    });

    it('lists disputes for a contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue({ id: CONTRIBUTION_ID });
      prisma.dispute.findMany.mockResolvedValue([dispute]);
      prisma.dispute.count.mockResolvedValue(1);

      const res = await request(app).get(`/api/v1/disputes/contribution/${CONTRIBUTION_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
    });

    it('scopes /me to the caller', async () => {
      prisma.dispute.findMany.mockResolvedValue([dispute]);
      prisma.dispute.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/disputes/me')
        .set('Authorization', bearer(reporterUser));

      expect(res.status).toBe(200);
      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ reportedBy: reporterUser.id }, { resolvedBy: reporterUser.id }],
          }),
        })
      );
    });
  });

  describe('PATCH /api/v1/disputes/:id/status', () => {
    it('lets a reviewer take an open dispute under review', async () => {
      mockRequester(prisma, reviewer);
      prisma.dispute.findUnique.mockResolvedValue({
        id: DISPUTE_ID,
        status: 'OPEN',
        contributionId: CONTRIBUTION_ID,
        reportedBy: reporterUser.id,
        previousContributionStatus: 'VERIFIED',
        contribution: { id: CONTRIBUTION_ID, status: 'DISPUTED', contributorId: dev.id, title: 'Fix' },
      });
      prisma.dispute.update.mockResolvedValue({ ...dispute, status: 'UNDER_REVIEW' });

      const res = await request(app)
        .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
        .set('Authorization', bearer(reviewer))
        .send({ status: 'UNDER_REVIEW' });

      expect(res.status).toBe(200);
      expect(res.body.data.dispute.status).toBe('UNDER_REVIEW');
    });

    it('resolves a dispute and applies the documented outcome', async () => {
      mockRequester(prisma, reviewer);
      prisma.dispute.findUnique.mockResolvedValue({
        id: DISPUTE_ID,
        status: 'UNDER_REVIEW',
        contributionId: CONTRIBUTION_ID,
        reportedBy: reporterUser.id,
        previousContributionStatus: 'VERIFIED',
        contribution: { id: CONTRIBUTION_ID, status: 'DISPUTED', contributorId: dev.id, title: 'Fix' },
      });
      prisma.dispute.update.mockResolvedValue({ ...dispute, status: 'RESOLVED', resolution: 'Confirmed duplication' });
      prisma.contribution.update.mockResolvedValue({});

      const res = await request(app)
        .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
        .set('Authorization', bearer(reviewer))
        .send({
          status: 'RESOLVED',
          resolution: 'Confirmed duplication of an existing pull request',
          contributionStatus: 'REJECTED',
        });

      expect(res.status).toBe(200);
      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'RESOLVED', resolvedBy: reviewer.id }),
        })
      );
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'REJECTED' } })
      );
    });

    it('dismissing a dispute restores the previous contribution status', async () => {
      mockRequester(prisma, reviewer);
      prisma.dispute.findUnique.mockResolvedValue({
        id: DISPUTE_ID,
        status: 'UNDER_REVIEW',
        contributionId: CONTRIBUTION_ID,
        reportedBy: reporterUser.id,
        previousContributionStatus: 'VERIFIED',
        contribution: { id: CONTRIBUTION_ID, status: 'DISPUTED', contributorId: dev.id, title: 'Fix' },
      });
      prisma.dispute.update.mockResolvedValue({ ...dispute, status: 'REJECTED' });
      prisma.contribution.update.mockResolvedValue({});

      const res = await request(app)
        .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
        .set('Authorization', bearer(reviewer))
        .send({ status: 'REJECTED', resolution: 'No evidence of misconduct was found' });

      expect(res.status).toBe(200);
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'VERIFIED' } })
      );
    });

    it('forbids maintainers from deciding the outcome', async () => {
      mockRequester(prisma, maintainer);
      prisma.dispute.findUnique.mockResolvedValue({
        id: DISPUTE_ID,
        status: 'UNDER_REVIEW',
        contributionId: CONTRIBUTION_ID,
        reportedBy: reporterUser.id,
        previousContributionStatus: 'VERIFIED',
        contribution: { id: CONTRIBUTION_ID, status: 'DISPUTED', contributorId: dev.id, title: 'Fix' },
      });

      const res = await request(app)
        .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
        .set('Authorization', bearer(maintainer))
        .send({ status: 'RESOLVED', resolution: 'Closing without proper review rights' });

      expect(res.status).toBe(403);
      expect(prisma.dispute.update).not.toHaveBeenCalled();
    });

    it('lets the contributor appeal a resolved dispute', async () => {
      mockRequester(prisma, dev);
      prisma.dispute.findUnique.mockResolvedValue({
        id: DISPUTE_ID,
        status: 'RESOLVED',
        contributionId: CONTRIBUTION_ID,
        reportedBy: reporterUser.id,
        previousContributionStatus: 'VERIFIED',
        contribution: { id: CONTRIBUTION_ID, status: 'REJECTED', contributorId: dev.id, title: 'Fix' },
      });
      prisma.dispute.update.mockResolvedValue({ ...dispute, status: 'APPEALED' });
      prisma.contribution.update.mockResolvedValue({});

      const res = await request(app)
        .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
        .set('Authorization', bearer(dev))
        .send({ status: 'APPEALED' });

      expect(res.status).toBe(200);
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DISPUTED' } })
      );
    });

    it('rejects an invalid dispute transition', async () => {
      mockRequester(prisma, reviewer);
      prisma.dispute.findUnique.mockResolvedValue({
        id: DISPUTE_ID,
        status: 'RESOLVED',
        contributionId: CONTRIBUTION_ID,
        reportedBy: reporterUser.id,
        previousContributionStatus: 'VERIFIED',
        contribution: { id: CONTRIBUTION_ID, status: 'REJECTED', contributorId: dev.id, title: 'Fix' },
      });

      const res = await request(app)
        .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
        .set('Authorization', bearer(reviewer))
        .send({ status: 'UNDER_REVIEW' });

      expect(res.status).toBe(409);
    });

    it('requires a documented resolution to close a dispute', async () => {
      mockRequester(prisma, reviewer);

      const res = await request(app)
        .patch(`/api/v1/disputes/${DISPUTE_ID}/status`)
        .set('Authorization', bearer(reviewer))
        .send({ status: 'RESOLVED' });

      expect(res.status).toBe(400);
      expect(res.body.errors.some((error) => error.field === 'resolution')).toBe(true);
    });
  });
});
