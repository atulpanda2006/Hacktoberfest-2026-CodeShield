import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();

const github = {
  getRepository: jest.fn(),
  getPullRequest: jest.fn(),
  getPullRequestCommits: jest.fn(),
  getCollaboratorPermission: jest.fn(),
};

jest.unstable_mockModule('../../src/integrations/github/githubClient.js', () => {
  class GitHubError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = 'GitHubError';
      this.code = options.code ?? 'UNKNOWN';
      this.status = options.status ?? null;
      this.isOperational = true;
    }
  }

  return {
    GitHubClient: github,
    GitHubError,
    GITHUB_ERROR_CODES: {
      NOT_FOUND: 'NOT_FOUND',
      UNAUTHORIZED: 'UNAUTHORIZED',
      FORBIDDEN: 'FORBIDDEN',
      RATE_LIMITED: 'RATE_LIMITED',
      TIMEOUT: 'TIMEOUT',
      UNAVAILABLE: 'UNAVAILABLE',
      INVALID_RESPONSE: 'INVALID_RESPONSE',
      UNKNOWN: 'UNKNOWN',
    },
    normalizeRepository: (value) => value,
    normalizePullRequest: (value) => value,
    normalizeCommit: (value) => value,
  };
});

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;
const { GitHubError } = await import('../../src/integrations/github/githubClient.js');

const REPO_ID = '9f9f9f9f-1111-4111-8111-9f9f9f9f9f9f';

const githubRepo = {
  githubRepositoryId: '987654',
  name: 'repo',
  fullName: 'owner/repo',
  description: 'A repo',
  repositoryUrl: 'https://github.com/owner/repo',
  ownerGithubUsername: 'owner',
  primaryLanguage: 'JavaScript',
  visibility: 'PUBLIC',
  stars: 12,
  forks: 3,
};

const registeredRepo = {
  id: REPO_ID,
  githubRepositoryId: githubRepo.githubRepositoryId,
  name: githubRepo.name,
  fullName: githubRepo.fullName,
  description: githubRepo.description,
  repositoryUrl: githubRepo.repositoryUrl,
  ownerGithubUsername: githubRepo.ownerGithubUsername,
  primaryLanguage: githubRepo.primaryLanguage,
  visibility: 'PUBLIC',
  stars: 12,
  forks: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function linkGithub(username) {
  prisma.developerProfile.findUnique.mockResolvedValue({ githubUsername: username });
}

describe('Repository Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, dev);
  });

  describe('POST /api/v1/repositories', () => {
    it('registers a repository verified against GitHub', async () => {
      linkGithub('owner');
      github.getRepository.mockResolvedValue(githubRepo);
      prisma.repository.findFirst.mockResolvedValue(null);
      prisma.repository.create.mockResolvedValue(registeredRepo);
      prisma.repositoryMember.create.mockResolvedValue({ id: 'member-1' });

      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', bearer(dev))
        .send({ repositoryUrl: 'https://github.com/owner/repo' });

      expect(res.status).toBe(201);
      expect(res.body.data.repository.fullName).toBe('owner/repo');

      const createArgs = prisma.repository.create.mock.calls[0][0];
      // GitHub is the source of truth, not the client payload
      expect(createArgs.data.githubRepositoryId).toBe('987654');
      expect(createArgs.data.stars).toBe(12);

      const memberArgs = prisma.repositoryMember.create.mock.calls[0][0];
      expect(memberArgs.data).toMatchObject({ userId: dev.id, role: 'OWNER' });
    });

    it('rejects a duplicate registration', async () => {
      linkGithub('owner');
      github.getRepository.mockResolvedValue(githubRepo);
      prisma.repository.findFirst.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });

      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', bearer(dev))
        .send({ fullName: 'owner/repo' });

      expect(res.status).toBe(409);
      expect(prisma.repository.create).not.toHaveBeenCalled();
    });

    it('returns 404 when GitHub cannot find the repository', async () => {
      linkGithub('owner');
      github.getRepository.mockRejectedValue(
        new GitHubError('not found', { code: 'NOT_FOUND', status: 404 })
      );

      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', bearer(dev))
        .send({ fullName: 'owner/ghost' });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
      expect(prisma.repository.create).not.toHaveBeenCalled();
    });

    it('returns 503 (and stores nothing) when GitHub is unreachable', async () => {
      linkGithub('owner');
      github.getRepository.mockRejectedValue(
        new GitHubError('down', { code: 'UNAVAILABLE' })
      );

      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', bearer(dev))
        .send({ fullName: 'owner/repo' });

      expect(res.status).toBe(503);
      expect(prisma.repository.create).not.toHaveBeenCalled();
    });

    it('requires a linked GitHub username', async () => {
      prisma.developerProfile.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', bearer(dev))
        .send({ fullName: 'owner/repo' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/GitHub username/i);
    });

    it('refuses registration when the user neither owns nor maintains the repo', async () => {
      linkGithub('someone-else');
      github.getRepository.mockResolvedValue(githubRepo);

      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', bearer(dev))
        .send({ fullName: 'owner/repo' });

      expect(res.status).toBe(403);
      expect(prisma.repository.create).not.toHaveBeenCalled();
    });

    it('validates the request body', async () => {
      const res = await request(app)
        .post('/api/v1/repositories')
        .set('Authorization', bearer(dev))
        .send({ description: 'missing references' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/repositories', () => {
    it('lists repositories with pagination metadata', async () => {
      prisma.repository.findMany.mockResolvedValue([registeredRepo]);
      prisma.repository.count.mockResolvedValue(1);

      const res = await request(app).get('/api/v1/repositories?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });

    it('returns 404 for an unknown repository', async () => {
      prisma.repository.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/repositories/${REPO_ID}`);

      expect(res.status).toBe(404);
    });

    it('returns 400 for a malformed repository id', async () => {
      const res = await request(app).get('/api/v1/repositories/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('id');
    });
  });

  describe('PUT / DELETE /api/v1/repositories/:id', () => {
    it('allows a repository owner to update editable metadata', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.repositoryMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.repository.update.mockResolvedValue({ ...registeredRepo, description: 'New' });

      const res = await request(app)
        .put(`/api/v1/repositories/${REPO_ID}`)
        .set('Authorization', bearer(dev))
        .send({ description: 'New' });

      expect(res.status).toBe(200);
      expect(res.body.data.repository.description).toBe('New');
    });

    it('forbids a plain contributor from editing the repository', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.repositoryMember.findUnique.mockResolvedValue({ role: 'CONTRIBUTOR' });

      const res = await request(app)
        .put(`/api/v1/repositories/${REPO_ID}`)
        .set('Authorization', bearer(dev))
        .send({ description: 'Hijack' });

      expect(res.status).toBe(403);
      expect(prisma.repository.update).not.toHaveBeenCalled();
    });

    it('deletes a repository for its owner', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.repositoryMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.repository.delete.mockResolvedValue({ id: REPO_ID });

      const res = await request(app)
        .delete(`/api/v1/repositories/${REPO_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/v1/repositories/:id/members', () => {
    it('adds a member idempotently via upsert', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.repositoryMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.user.findUnique.mockResolvedValue({
        id: TEST_USERS.otherDeveloper.id,
        username: 'devtwo',
        accountStatus: 'ACTIVE',
      });
      prisma.repositoryMember.upsert.mockResolvedValue({
        id: 'member-2',
        role: 'MAINTAINER',
        user: { id: TEST_USERS.otherDeveloper.id, username: 'devtwo', role: 'DEVELOPER' },
      });

      const res = await request(app)
        .post(`/api/v1/repositories/${REPO_ID}/members`)
        .set('Authorization', bearer(dev))
        .send({ userId: TEST_USERS.otherDeveloper.id, role: 'MAINTAINER' });

      expect(res.status).toBe(200);
      expect(prisma.repositoryMember.upsert).toHaveBeenCalled();
    });

    it('returns 404 for an unknown member user', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID, fullName: 'owner/repo' });
      prisma.repositoryMember.findUnique.mockResolvedValue({ role: 'OWNER' });
      prisma.user.findUnique.mockImplementation(async ({ where }) =>
        where.id === dev.id ? dev : null
      );

      const res = await request(app)
        .post(`/api/v1/repositories/${REPO_ID}/members`)
        .set('Authorization', bearer(dev))
        .send({ userId: TEST_USERS.otherDeveloper.id });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/repositories/:id/contributions', () => {
    it('delegates to the contribution service', async () => {
      prisma.repository.findUnique.mockResolvedValue({ id: REPO_ID });
      prisma.contribution.findMany.mockResolvedValue([]);
      prisma.contribution.count.mockResolvedValue(0);

      const res = await request(app).get(`/api/v1/repositories/${REPO_ID}/contributions`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.total).toBe(0);
    });
  });
});
