import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();
const ai = { analyze: jest.fn() };

jest.unstable_mockModule('../../src/integrations/ai/aiClient.js', () => {
  class AIError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = 'AIError';
      this.code = options.code ?? 'UNAVAILABLE';
      this.status = options.status ?? null;
      this.isOperational = true;
    }
  }

  return {
    AIClient: ai,
    AIError,
    AI_ERROR_CODES: {
      TIMEOUT: 'TIMEOUT',
      UNAVAILABLE: 'UNAVAILABLE',
      RATE_LIMITED: 'RATE_LIMITED',
      SERVER_ERROR: 'SERVER_ERROR',
      REJECTED: 'REJECTED',
      INVALID_RESPONSE: 'INVALID_RESPONSE',
      NOT_CONFIGURED: 'NOT_CONFIGURED',
    },
    default: ai,
  };
});

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');
const { AIError } = await import('../../src/integrations/ai/aiClient.js');

const dev = TEST_USERS.developer;
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
  status: 'VERIFIED',
  repository: {
    id: REPO_ID,
    fullName: 'owner/repo',
    primaryLanguage: 'JavaScript',
    stars: 10,
    forks: 2,
    description: 'A repo',
  },
  contributor: {
    id: dev.id,
    username: dev.username,
    profile: {
      githubUsername: 'devone-gh',
      experienceLevel: 'MID',
      skills: ['JavaScript'],
    },
    reputation: null,
  },
  evidence: [
    {
      evidenceType: 'PULL_REQUEST',
      externalReference: 'https://github.com/owner/repo/pull/42',
      metadata: {
        pullRequest: {
          title: 'Fix the bug',
          state: 'OPEN',
          merged: false,
          authorLogin: 'devone-gh',
          additions: 12,
          deletions: 3,
          changedFiles: 2,
        },
      },
      verified: true,
    },
    {
      evidenceType: 'COMMIT',
      externalReference: 'abc123',
      metadata: { sha: 'abc123', message: 'Fix it', authorLogin: 'devone-gh' },
      verified: true,
    },
  ],
};

const validAnalysis = {
  contributionId: CONTRIBUTION_ID,
  qualityScore: 82,
  riskScore: 15,
  similarityIndicators: { matchedRepositories: [] },
  suspiciousIndicators: [],
  confidence: 0.91,
  explanation: 'Well scoped fix with tests',
  modelVersion: '1.0',
};

const storedAnalysis = {
  id: 'a1a1a1a1-1111-4111-8111-a1a1a1a1a1a1',
  contributionId: CONTRIBUTION_ID,
  ...validAnalysis,
  analysisStatus: 'COMPLETED',
  analyzedAt: new Date(),
};

describe('AI Integration Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, dev);
  });

  describe('POST /api/v1/ai/analyze/:contributionId', () => {
    it('sends a verified contribution to the AI service and stores the result', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.aIAnalysis.findFirst.mockResolvedValue(null);
      prisma.aIAnalysis.create.mockResolvedValue({ id: storedAnalysis.id });
      prisma.aIAnalysis.update.mockResolvedValue(storedAnalysis);
      ai.analyze.mockResolvedValue(validAnalysis);

      const res = await request(app)
        .post(`/api/v1/ai/analyze/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.analysis.qualityScore).toBe(82);
      expect(res.body.data.analysis.modelVersion).toBe('1.0');

      const updateArgs = prisma.aIAnalysis.update.mock.calls[0][0];
      expect(updateArgs.data).toMatchObject({
        analysisStatus: 'COMPLETED',
        qualityScore: 82,
        riskScore: 15,
        modelVersion: '1.0',
      });

      // The AI payload carries verified evidence, not raw source code
      const payload = ai.analyze.mock.calls[0][0];
      expect(payload.contributionId).toBe(CONTRIBUTION_ID);
      expect(payload.commits).toHaveLength(1);
      expect(payload.diff).toEqual({ additions: 12, deletions: 3, changedFiles: 2 });
      expect(payload.requestId).toBeDefined();
    });

    it('refuses to analyze an unverified contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue({ ...contribution, status: 'SUBMITTED' });

      const res = await request(app)
        .post(`/api/v1/ai/analyze/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(409);
      expect(ai.analyze).not.toHaveBeenCalled();
    });

    it('refuses overlapping analyses', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.aIAnalysis.findFirst.mockResolvedValue({ id: 'in-flight' });

      const res = await request(app)
        .post(`/api/v1/ai/analyze/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(409);
      expect(ai.analyze).not.toHaveBeenCalled();
    });

    it('records a TIMEOUT and returns 503 when the AI service does not answer', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.aIAnalysis.findFirst.mockResolvedValue(null);
      prisma.aIAnalysis.create.mockResolvedValue({ id: storedAnalysis.id });
      ai.analyze.mockRejectedValue(new AIError('timeout', { code: 'TIMEOUT' }));

      const res = await request(app)
        .post(`/api/v1/ai/analyze/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(503);
      expect(prisma.aIAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ analysisStatus: 'TIMEOUT' }) })
      );
      // Status is restored so the contribution is not stuck in UNDER_AI_ANALYSIS
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'VERIFIED' } })
      );
    });

    it('rejects out-of-range AI scores and stores a FAILED record', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.aIAnalysis.findFirst.mockResolvedValue(null);
      prisma.aIAnalysis.create.mockResolvedValue({ id: storedAnalysis.id });
      ai.analyze.mockResolvedValue({ ...validAnalysis, qualityScore: 150 });

      const res = await request(app)
        .post(`/api/v1/ai/analyze/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(503);
      expect(prisma.aIAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ analysisStatus: 'FAILED' }) })
      );
      // Nothing invalid reached the stored scores
      expect(prisma.aIAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ qualityScore: 150 }) })
      );
    });

    it('rejects a response whose contributionId does not match', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.aIAnalysis.findFirst.mockResolvedValue(null);
      prisma.aIAnalysis.create.mockResolvedValue({ id: storedAnalysis.id });
      ai.analyze.mockResolvedValue({
        ...validAnalysis,
        contributionId: 'd0d0d0d0-1111-4111-8111-d0d0d0d0d0d0',
      });

      const res = await request(app)
        .post(`/api/v1/ai/analyze/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(502);
    });

    it('forbids unrelated developers', async () => {
      mockRequester(prisma, TEST_USERS.otherDeveloper);
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.repositoryMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/ai/analyze/${CONTRIBUTION_ID}`)
        .set('Authorization', bearer(TEST_USERS.otherDeveloper));

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/ai/results/:contributionId', () => {
    it('returns the latest completed analysis and history', async () => {
      prisma.contribution.findUnique.mockResolvedValue({
        id: CONTRIBUTION_ID,
        status: 'VERIFIED',
        title: 'Fix the bug',
        githubPRUrl: contribution.githubPRUrl,
      });
      prisma.aIAnalysis.findMany.mockResolvedValue([
        storedAnalysis,
        { ...storedAnalysis, id: 'old', analysisStatus: 'FAILED', qualityScore: null },
      ]);

      const res = await request(app).get(`/api/v1/ai/results/${CONTRIBUTION_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.data.latest.analysisStatus).toBe('COMPLETED');
      expect(res.body.data.summary.totalAnalyses).toBe(2);
      expect(res.body.data.summary.completedAnalyses).toBe(1);
      expect(res.body.data.summary.modelVersions).toEqual(['1.0']);
    });

    it('returns 404 for an unknown contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/ai/results/${CONTRIBUTION_ID}`);

      expect(res.status).toBe(404);
    });
  });
});
