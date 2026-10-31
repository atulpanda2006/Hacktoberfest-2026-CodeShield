import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;

const profile = {
  id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  userId: dev.id,
  fullName: 'Dev One',
  bio: 'Backend developer',
  avatarUrl: null,
  githubUsername: 'devone-gh',
  githubProfileUrl: 'https://github.com/devone-gh',
  skills: ['Node.js', 'PostgreSQL'],
  experienceLevel: 'MID',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('Developer Profiles Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
  });

  describe('POST /api/v1/profiles', () => {
    it('creates a profile for the authenticated user', async () => {
      mockRequester(prisma, dev);
      prisma.developerProfile.findUnique.mockResolvedValue(null);
      prisma.developerProfile.create.mockResolvedValue(profile);

      const res = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', bearer(dev))
        .send({
          fullName: 'Dev One',
          bio: 'Backend developer',
          githubUsername: 'devone-gh',
          skills: ['Node.js', 'PostgreSQL'],
          experienceLevel: 'MID',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.profile.id).toBe(profile.id);

      const createArgs = prisma.developerProfile.create.mock.calls[0][0];
      expect(createArgs.data.userId).toBe(dev.id);
      // Derived from the GitHub username, never trusted from the client
      expect(createArgs.data.githubProfileUrl).toBe('https://github.com/devone-gh');
    });

    it('returns 409 when the user already has a profile', async () => {
      mockRequester(prisma, dev);
      prisma.developerProfile.findUnique.mockResolvedValue(profile);

      const res = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', bearer(dev))
        .send({ fullName: 'Dev One' });

      expect(res.status).toBe(409);
    });

    it('returns 409 when the GitHub username is already linked', async () => {
      mockRequester(prisma, dev);
      // First call: profile for userId (none). Second call: owner of the GitHub username.
      prisma.developerProfile.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...profile, id: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb' });

      const res = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', bearer(dev))
        .send({ githubUsername: 'devone-gh' });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/already linked/i);
    });

    it('rejects an invalid GitHub username', async () => {
      mockRequester(prisma, dev);

      const res = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', bearer(dev))
        .send({ githubUsername: '-invalid-' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('githubUsername');
    });

    it('rejects a non-array skills payload', async () => {
      mockRequester(prisma, dev);

      const res = await request(app)
        .post('/api/v1/profiles')
        .set('Authorization', bearer(dev))
        .send({ skills: 'Node.js' });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('skills');
    });

    it('requires authentication', async () => {
      const res = await request(app).post('/api/v1/profiles').send({ fullName: 'Anon' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/profiles/me', () => {
    it('returns the profile with aggregated statistics', async () => {
      mockRequester(prisma, dev);
      prisma.developerProfile.findUnique.mockResolvedValue({ ...profile, user: dev });
      prisma.contribution.groupBy.mockResolvedValue([
        { status: 'APPROVED', _count: { _all: 3 } },
        { status: 'SUBMITTED', _count: { _all: 2 } },
      ]);
      prisma.contribution.count.mockResolvedValue(5);
      prisma.repositoryMember.count.mockResolvedValue(2);
      prisma.review.count.mockResolvedValue(4);
      prisma.trustRelationship.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _avg: { trustLevel: 3.5 },
      });
      prisma.reputation.findUnique.mockResolvedValue({
        overallScore: 72.5,
        qualityScore: 80,
        reliabilityScore: 70,
        consistencyScore: 60,
        communityScore: 75,
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get('/api/v1/profiles/me')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.profile.stats.contributions).toMatchObject({
        total: 5,
        approved: 3,
        verified: 3,
        pendingVerification: 2,
      });
      expect(res.body.data.profile.stats.trust).toEqual({
        received: 3,
        averageTrustLevel: 3.5,
      });
      expect(res.body.data.profile.stats.reputation.overallScore).toBe(72.5);
    });

    it('returns 404 when the profile does not exist', async () => {
      mockRequester(prisma, dev);
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/profiles/me')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/profiles/:userId', () => {
    it('returns a public profile without private account fields', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: dev.id, accountStatus: 'ACTIVE' });
      prisma.developerProfile.findUnique.mockResolvedValue({
        ...profile,
        user: { id: dev.id, username: dev.username, role: dev.role, createdAt: profile.createdAt },
      });

      const res = await request(app).get(`/api/v1/profiles/${dev.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.profile.user).not.toHaveProperty('email');
      expect(res.body.data.profile.stats).toBeDefined();
    });

    it('returns 400 for a malformed user id', async () => {
      const res = await request(app).get('/api/v1/profiles/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('userId');
    });

    it('returns 404 when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/profiles/${dev.id}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 when the user has no profile', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: dev.id, accountStatus: 'ACTIVE' });
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/profiles/${dev.id}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Developer profile not found');
    });
  });

  describe('PUT /api/v1/profiles/me', () => {
    it('updates the caller profile and derives the GitHub profile URL', async () => {
      mockRequester(prisma, dev);
      prisma.developerProfile.findUnique
        .mockResolvedValueOnce(profile) // existence check
        .mockResolvedValueOnce(null); // github username owner
      prisma.developerProfile.update.mockResolvedValue({
        ...profile,
        githubUsername: 'new-gh',
        githubProfileUrl: 'https://github.com/new-gh',
      });

      const res = await request(app)
        .put('/api/v1/profiles/me')
        .set('Authorization', bearer(dev))
        .send({ githubUsername: 'new-gh' });

      expect(res.status).toBe(200);
      const updateArgs = prisma.developerProfile.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ userId: dev.id });
      expect(updateArgs.data.githubProfileUrl).toBe('https://github.com/new-gh');
    });

    it('rejects an empty update body', async () => {
      mockRequester(prisma, dev);

      const res = await request(app)
        .put('/api/v1/profiles/me')
        .set('Authorization', bearer(dev))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
    });

    it('returns 404 when the profile does not exist yet', async () => {
      mockRequester(prisma, dev);
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/v1/profiles/me')
        .set('Authorization', bearer(dev))
        .send({ fullName: 'Someone' });

      expect(res.status).toBe(404);
    });
  });
});
