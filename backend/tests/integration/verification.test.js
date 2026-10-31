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
const { GitHubError } = await import('../../src/integrations/github/githubClient.js');

const dev = TEST_USERS.developer;
const REPO_ID = '9f9f9f9f-1111-4111-8111-9f9f9f9f9f9f';
const CONTRIBUTION_ID = 'c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0';

const contribution = {
  id: CONTRIBUTION_ID,
  contributorId: dev.id,
  repositoryId: REPO_ID,
  githubPRNumber: 42,
  githubPRUrl: 'https://github.com/owner/repo/pull/42',
  status: 'SUBMITTED',
  title: 'Fix the bug',
  repository: {
    id: REPO_ID,
    fullName: 'owner/repo',
    githubRepositoryId: '987654',
  },
  contributor: {
    id: dev.id,
    username: dev.username,
    profile: { githubUsername: 'devone-gh' },
  },
};

const githubRepo = {
  githubRepositoryId: '987654',
  fullName: 'owner/repo',
  name: 'repo',
};

const pullRequest = {
  githubPRId: '777',
  githubPRNumber: 42,
  githubPRUrl: 'https://github.com/owner/repo/pull/42',
  title: 'Fix the bug',
  state: 'OPEN',
  merged: false,
  mergedAt: null,
  mergeCommitSha: null,
  authorLogin: 'devone-gh',
  baseRepoFullName: 'owner/repo',
  baseRepoGithubId: '987654',
  additions: 12,
  deletions: 3,
  changedFiles: 2,
};

const commits = [
  {
    sha: 'abc123',
    message: 'Fix it',
    authorLogin: 'devone-gh',
    authoredAt: '2026-10-01T00:00:00Z',
    additions: 12,
    deletions: 3,
  },
];

function mockGithubSuccess() {
  github.getRepository.mockResolvedValue(githubRepo);
  github.getPullRequest.mockResolvedValue(pullRequest);
  github.getPullRequestCommits.mockResolvedValue(commits);
}

describe('Verification Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, dev);
  });

  describe('POST /api/v1/verification/:contributionId', () => {
    it('verifies a matching pull request and stores evidence', async () => {
      mockGithubSuccess();
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.contributionEvidence.createMany.mockResolvedValue({ count: 3 });
      prisma.verificationRecord.createMany.mockResolvedValue({ count: 6 });
      prisma.contribution.update.mockResolvedValue({});
      prisma.contributionEvidence.findMany.mockResolvedValue([]);
      prisma.verificationRecord.findMany.mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/v1/verification/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.verification.verified).toBe(true);
      expect(res.body.data.verification.status).toBe('VERIFIED');
      expect(res.body.data.verification.checks.CONTRIBUTOR_IDENTITY.passed).toBe(true);

      const evidenceRows = prisma.contributionEvidence.createMany.mock.calls[0][0].data;
      const types = evidenceRows.map((row) => row.evidenceType);
      expect(types).toContain('PULL_REQUEST');
      expect(types).toContain('COMMIT');
      expect(types).toContain('GITHUB_API');
      // No merge evidence for an unmerged PR
      expect(types).not.toContain('MERGE');

      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'VERIFIED' } })
      );
    });

    it('records MERGE evidence for a merged PR without approving the contribution', async () => {
      github.getRepository.mockResolvedValue(githubRepo);
      github.getPullRequest.mockResolvedValue({
        ...pullRequest,
        state: 'MERGED',
        merged: true,
        mergeCommitSha: 'deadbeef',
      });
      github.getPullRequestCommits.mockResolvedValue(commits);
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.contributionEvidence.findMany.mockResolvedValue([]);
      prisma.verificationRecord.findMany.mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/v1/verification/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      const evidenceRows = prisma.contributionEvidence.createMany.mock.calls[0][0].data;
      expect(evidenceRows.map((row) => row.evidenceType)).toContain('MERGE');
      // Merged is evidence, not a quality verdict
      expect(res.body.data.verification.status).toBe('VERIFIED');
      expect(prisma.contribution.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'APPROVED' } })
      );
    });

    it('fails verification when the PR author does not match the linked GitHub user', async () => {
      github.getRepository.mockResolvedValue(githubRepo);
      github.getPullRequest.mockResolvedValue({ ...pullRequest, authorLogin: 'someone-else' });
      github.getPullRequestCommits.mockResolvedValue(commits);
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.contributionEvidence.findMany.mockResolvedValue([]);
      prisma.verificationRecord.findMany.mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/v1/verification/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.verification.verified).toBe(false);
      expect(res.body.data.verification.checks.CONTRIBUTOR_IDENTITY.passed).toBe(false);
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'PENDING_VERIFICATION' } })
      );
    });

    it('fails verification when the PR belongs to another repository', async () => {
      github.getRepository.mockResolvedValue(githubRepo);
      github.getPullRequest.mockResolvedValue({
        ...pullRequest,
        baseRepoFullName: 'other/repo',
        baseRepoGithubId: '111111',
      });
      github.getPullRequestCommits.mockResolvedValue(commits);
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.contributionEvidence.findMany.mockResolvedValue([]);
      prisma.verificationRecord.findMany.mockResolvedValue([]);

      const res = await request(app)
        .post(`/api/v1/verification/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.verification.checks.REPO_MATCH.passed).toBe(false);
      expect(res.body.data.verification.verified).toBe(false);
    });

    it('returns 503 and stores nothing when GitHub is unreachable', async () => {
      github.getRepository.mockRejectedValue(new GitHubError('down', { code: 'UNAVAILABLE' }));
      prisma.contribution.findUnique.mockResolvedValue(contribution);

      const res = await request(app)
        .post(`/api/v1/verification/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(503);
      expect(prisma.contributionEvidence.createMany).not.toHaveBeenCalled();
      expect(prisma.verificationRecord.createMany).not.toHaveBeenCalled();
      expect(prisma.contribution.update).not.toHaveBeenCalled();
    });

    it('returns 404 when the pull request does not exist on GitHub', async () => {
      github.getRepository.mockResolvedValue(githubRepo);
      github.getPullRequest.mockRejectedValue(
        new GitHubError('missing', { code: 'NOT_FOUND', status: 404 })
      );
      prisma.contribution.findUnique.mockResolvedValue(contribution);

      const res = await request(app)
        .post(`/api/v1/verification/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(404);
    });

    it('forbids unrelated developers', async () => {
      mockRequester(prisma, TEST_USERS.otherDeveloper);
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.repositoryMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/verification/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(TEST_USERS.otherDeveloper));

      expect(res.status).toBe(403);
    });

    it('requires authentication', async () => {
      const res = await request(app).post(`/api/v1/verification/${CONTRIBUTION_ID}`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/verification/:contributionId', () => {
    it('returns the verification summary', async () => {
      prisma.contribution.findUnique.mockResolvedValue({
        id: CONTRIBUTION_ID,
        status: 'VERIFIED',
        githubPRNumber: 42,
        githubPRUrl: contribution.githubPRUrl,
      });
      prisma.verificationRecord.findMany.mockResolvedValue([
        { id: 'v1', verificationType: 'PR_EXISTS', verificationStatus: 'PASSED' },
        { id: 'v2', verificationType: 'FULL_VERIFICATION', verificationStatus: 'PASSED' },
      ]);
      prisma.verificationRecord.findFirst.mockResolvedValue({
        id: 'v2',
        verificationType: 'FULL_VERIFICATION',
        verificationStatus: 'PASSED',
      });
      prisma.contributionEvidence.findMany.mockResolvedValue([
        { id: 'e1', evidenceType: 'PULL_REQUEST' },
        { id: 'e2', evidenceType: 'COMMIT' },
      ]);

      const res = await request(app).get(`/api/v1/verification/${CONTRIBUTION_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.data.verification.verified).toBe(true);
      expect(res.body.data.verification.evidenceSummary).toEqual({
        total: 2,
        byType: { PULL_REQUEST: 1, COMMIT: 1 },
      });
    });

    it('returns 404 for an unknown contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/verification/${CONTRIBUTION_ID}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/verification/:contributionId/evidence', () => {
    it('lists stored evidence', async () => {
      prisma.contribution.findUnique.mockResolvedValue({ id: CONTRIBUTION_ID });
      prisma.contributionEvidence.findMany.mockResolvedValue([
        { id: 'e1', evidenceType: 'PULL_REQUEST' },
      ]);

      const res = await request(app).get(
        `/api/v1/verification/${CONTRIBUTION_ID}/evidence?evidenceType=PULL_REQUEST`
      );

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(1);
      expect(prisma.contributionEvidence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { contributionId: CONTRIBUTION_ID, evidenceType: 'PULL_REQUEST' },
        })
      );
    });
  });
});
