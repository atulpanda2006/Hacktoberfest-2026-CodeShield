import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;
const maintainer = TEST_USERS.maintainer;

const REPO_ID = '9f9f9f9f-1111-4111-8111-9f9f9f9f9f9f';
const CONTRIBUTION_ID = 'c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0';

const contribution = {
  id: CONTRIBUTION_ID,
  contributorId: dev.id,
  repositoryId: REPO_ID,
  githubPRNumber: 42,
  githubPRUrl: 'https://github.com/owner/repo/pull/42',
  title: 'Fix the bug',
  description: 'Fixes it',
  contributionType: 'BUG_FIX',
  status: 'SUBMITTED',
  submittedAt: new Date(),
  updatedAt: new Date(),
  repository: { id: REPO_ID, name: 'repo', fullName: 'owner/repo', ownerGithubUsername: 'owner' },
  contributor: { id: dev.id, username: dev.username },
};

describe('Contributions Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, dev);
  });

  describe('POST /api/v1/contributions', () => {
    it('submits a contribution and registers the contributor membership', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.developerProfile.findUnique.mockResolvedValue({ githubUsername: 'devone-gh' });
      prisma.contribution.findFirst.mockResolvedValue(null);
      prisma.contribution.create.mockResolvedValue(contribution);
      prisma.repositoryMember.upsert.mockResolvedValue({});

      const res = await request(app)
        .post('/api/v1/contributions')
        .set('Authorization', bearer(dev))
        .send({
          repositoryId: REPO_ID,
          githubPRUrl: 'https://github.com/owner/repo/pull/42',
          title: 'Fix the bug',
          contributionType: 'BUG_FIX',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.contribution.status).toBe('SUBMITTED');

      const createArgs = prisma.contribution.create.mock.calls[0][0];
      expect(createArgs.data.githubPRNumber).toBe(42);
      expect(createArgs.data.contributorId).toBe(dev.id);
      expect(createArgs.data.status).toBe('SUBMITTED');
      expect(prisma.repositoryMember.upsert).toHaveBeenCalled();
    });

    it('rejects a duplicate pull request', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.developerProfile.findUnique.mockResolvedValue({ githubUsername: 'devone-gh' });
      prisma.contribution.findFirst.mockResolvedValue({ id: CONTRIBUTION_ID });

      const res = await request(app)
        .post('/api/v1/contributions')
        .set('Authorization', bearer(dev))
        .send({ repositoryId: REPO_ID, githubPRNumber: 42, title: 'Fix the bug' });

      expect(res.status).toBe(409);
      expect(prisma.contribution.create).not.toHaveBeenCalled();
    });

    it('requires a linked GitHub username', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/contributions')
        .set('Authorization', bearer(dev))
        .send({ repositoryId: REPO_ID, githubPRNumber: 42, title: 'Fix the bug' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/GitHub username/i);
    });

    it('rejects an unregistered repository', async () => {
      prisma.repository.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/contributions')
        .set('Authorization', bearer(dev))
        .send({ repositoryId: REPO_ID, githubPRNumber: 42, title: 'Fix the bug' });

      expect(res.status).toBe(404);
    });

    it('rejects a URL that is not a pull request', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.developerProfile.findUnique.mockResolvedValue({ githubUsername: 'devone-gh' });

      const res = await request(app)
        .post('/api/v1/contributions')
        .set('Authorization', bearer(dev))
        .send({
          repositoryId: REPO_ID,
          githubPRUrl: 'https://github.com/owner/repo/issues/3',
          title: 'Fix the bug',
        });

      expect(res.status).toBe(400);
    });

    it('requires either a PR number or PR URL', async () => {
      const res = await request(app)
        .post('/api/v1/contributions')
        .set('Authorization', bearer(dev))
        .send({ repositoryId: REPO_ID, title: 'Fix the bug' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
    });

    it('rejects mismatched PR number and URL', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.developerProfile.findUnique.mockResolvedValue({ githubUsername: 'devone-gh' });

      const res = await request(app)
        .post('/api/v1/contributions')
        .set('Authorization', bearer(dev))
        .send({
          repositoryId: REPO_ID,
          githubPRNumber: 7,
          githubPRUrl: 'https://github.com/owner/repo/pull/42',
          title: 'Fix the bug',
        });

      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/v1/contributions')
        .send({ repositoryId: REPO_ID, githubPRNumber: 42, title: 'Fix the bug' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/contributions', () => {
    it('lists contributions with filters', async () => {
      prisma.contribution.findMany.mockResolvedValue([contribution]);
      prisma.contribution.count.mockResolvedValue(1);

      const res = await request(app).get('/api/v1/contributions?status=SUBMITTED');

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(1);
      const args = prisma.contribution.findMany.mock.calls[0][0];
      expect(args.where.status).toBe('SUBMITTED');
    });

    it('scopes /me to the caller', async () => {
      prisma.contribution.findMany.mockResolvedValue([contribution]);
      prisma.contribution.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/contributions/me')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      const args = prisma.contribution.findMany.mock.calls[0][0];
      expect(args.where.contributorId).toBe(dev.id);
    });

    it('returns 404 for a missing contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/contributions/${CONTRIBUTION_ID}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/contributions/:id/status', () => {
    it('lets a contributor queue their own contribution for verification', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.contribution.update.mockResolvedValue({ ...contribution, status: 'PENDING_VERIFICATION' });

      const res = await request(app)
        .patch(`/api/v1/contributions/${CONTRIBUTION_ID}/status`)
        .set('Authorization', bearer(dev))
        .send({ status: 'PENDING_VERIFICATION' });

      expect(res.status).toBe(200);
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PENDING_VERIFICATION' } })
      );
    });

    it('forbids a contributor from approving their own contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.repositoryMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/contributions/${CONTRIBUTION_ID}/status`)
        .set('Authorization', bearer(dev))
        .send({ status: 'APPROVED' });

      // SUBMITTED -> APPROVED is not a valid transition
      expect(res.status).toBe(409);
      expect(prisma.contribution.update).not.toHaveBeenCalled();
    });

    it('forbids a contributor from moving VERIFIED to an outcome', async () => {
      prisma.contribution.findUnique.mockResolvedValue({ ...contribution, status: 'VERIFIED' });
      prisma.repositoryMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/contributions/${CONTRIBUTION_ID}/status`)
        .set('Authorization', bearer(dev))
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
      expect(prisma.contribution.update).not.toHaveBeenCalled();
    });

    it('lets a maintainer approve a contribution under community review', async () => {
      prisma.contribution.findUnique.mockResolvedValue({
        ...contribution,
        status: 'UNDER_COMMUNITY_REVIEW',
      });
      prisma.repositoryMember.findUnique.mockResolvedValue(null);
      prisma.contribution.update.mockResolvedValue({ ...contribution, status: 'APPROVED' });
      mockRequester(prisma, maintainer);

      const res = await request(app)
        .patch(`/api/v1/contributions/${CONTRIBUTION_ID}/status`)
        .set('Authorization', bearer(maintainer))
        .send({ status: 'APPROVED', reason: 'Looks good' });

      expect(res.status).toBe(200);
    });

    it('forbids an unrelated developer', async () => {
      prisma.contribution.findUnique.mockResolvedValue({
        ...contribution,
        status: 'UNDER_COMMUNITY_REVIEW',
      });
      prisma.repositoryMember.findUnique.mockResolvedValue(null);
      mockRequester(prisma, TEST_USERS.otherDeveloper);

      const res = await request(app)
        .patch(`/api/v1/contributions/${CONTRIBUTION_ID}/status`)
        .set('Authorization', bearer(TEST_USERS.otherDeveloper))
        .send({ status: 'APPROVED' });

      expect(res.status).toBe(403);
    });

    it('rejects DISPUTED as a direct API target', async () => {
      prisma.contribution.findUnique.mockResolvedValue({ ...contribution, status: 'APPROVED' });
      mockRequester(prisma, maintainer);

      const res = await request(app)
        .patch(`/api/v1/contributions/${CONTRIBUTION_ID}/status`)
        .set('Authorization', bearer(maintainer))
        .send({ status: 'DISPUTED' });

      expect(res.status).toBe(400);
    });

    it('rejects an invalid status value', async () => {
      const res = await request(app)
        .patch(`/api/v1/contributions/${CONTRIBUTION_ID}/status`)
        .set('Authorization', bearer(dev))
        .send({ status: 'NOT_A_STATUS' });

      expect(res.status).toBe(400);
    });
  });
});
