import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;
const reviewer = TEST_USERS.reviewer;
const other = TEST_USERS.otherDeveloper;

const REPO_ID = '9f9f9f9f-1111-4111-8111-9f9f9f9f9f9f';
const CONTRIBUTION_ID = 'c0c0c0c0-1111-4111-8111-c0c0c0c0c0c0';
const REVIEW_ID = 'rrrrrrrr-1111-4111-8111-rrrrrrrrrrrr'.replace(/r/g, 'a');

const contribution = {
  id: CONTRIBUTION_ID,
  title: 'Fix the bug',
  status: 'VERIFIED',
  contributorId: dev.id,
  repositoryId: REPO_ID,
};

const review = {
  id: REVIEW_ID,
  contributionId: CONTRIBUTION_ID,
  reviewerId: reviewer.id,
  decision: 'APPROVE',
  rating: 5,
  comments: 'Nice work',
  createdAt: new Date(),
  updatedAt: new Date(),
  reviewer: { id: reviewer.id, username: reviewer.username, role: reviewer.role },
};

describe('Community Reviews Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, reviewer);
  });

  describe('POST /api/v1/reviews', () => {
    it('records a review and moves the contribution into community review', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.review.findUnique.mockResolvedValue(null);
      prisma.review.create.mockResolvedValue(review);
      prisma.contribution.update.mockResolvedValue({});

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(reviewer))
        .send({
          contributionId: CONTRIBUTION_ID,
          decision: 'APPROVE',
          rating: 5,
          comments: 'Nice work',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.review.decision).toBe('APPROVE');
      expect(prisma.review.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contributionId: CONTRIBUTION_ID,
            reviewerId: reviewer.id,
            decision: 'APPROVE',
          }),
        })
      );
      expect(prisma.contribution.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'UNDER_COMMUNITY_REVIEW' } })
      );
    });

    it('forbids reviewing your own contribution', async () => {
      mockRequester(prisma, dev);
      prisma.contribution.findUnique.mockResolvedValue(contribution);

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(dev))
        .send({ contributionId: CONTRIBUTION_ID, decision: 'APPROVE' });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/your own/i);
    });

    it('forbids developers who are not maintainers or reviewers', async () => {
      mockRequester(prisma, other);
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.repositoryMember.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(other))
        .send({ contributionId: CONTRIBUTION_ID, decision: 'APPROVE' });

      expect(res.status).toBe(403);
    });

    it('refuses to review an unverified contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue({ ...contribution, status: 'SUBMITTED' });

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(reviewer))
        .send({ contributionId: CONTRIBUTION_ID, decision: 'APPROVE' });

      expect(res.status).toBe(409);
    });

    it('refuses a second review by the same reviewer', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.review.findUnique.mockResolvedValue({ id: REVIEW_ID });

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(reviewer))
        .send({ contributionId: CONTRIBUTION_ID, decision: 'REJECT' });

      expect(res.status).toBe(409);
    });

    it('refuses to review a finalised contribution', async () => {
      prisma.contribution.findUnique.mockResolvedValue({ ...contribution, status: 'APPROVED' });

      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(reviewer))
        .send({ contributionId: CONTRIBUTION_ID, decision: 'APPROVE' });

      expect(res.status).toBe(409);
    });

    it('validates the decision and rating', async () => {
      const res = await request(app)
        .post('/api/v1/reviews')
        .set('Authorization', bearer(reviewer))
        .send({ contributionId: CONTRIBUTION_ID, decision: 'MAYBE', rating: 9 });

      expect(res.status).toBe(400);
      expect(res.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('PATCH /api/v1/reviews/:reviewId', () => {
    it('lets the reviewer update their decision', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: REVIEW_ID,
        reviewerId: reviewer.id,
        contributionId: CONTRIBUTION_ID,
        contribution: { status: 'UNDER_COMMUNITY_REVIEW', contributorId: dev.id },
      });
      prisma.review.update.mockResolvedValue({ ...review, decision: 'REQUEST_CHANGES' });

      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_ID}`)
        .set('Authorization', bearer(reviewer))
        .send({ decision: 'REQUEST_CHANGES' });

      expect(res.status).toBe(200);
      expect(res.body.data.review.decision).toBe('REQUEST_CHANGES');
    });

    it('forbids editing another reviewer\'s review', async () => {
      prisma.review.findUnique.mockResolvedValue({
        id: REVIEW_ID,
        reviewerId: other.id,
        contributionId: CONTRIBUTION_ID,
        contribution: { status: 'UNDER_COMMUNITY_REVIEW', contributorId: dev.id },
      });

      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_ID}`)
        .set('Authorization', bearer(reviewer))
        .send({ decision: 'REJECT' });

      expect(res.status).toBe(403);
      expect(prisma.review.update).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown review', async () => {
      prisma.review.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .patch(`/api/v1/reviews/${REVIEW_ID}`)
        .set('Authorization', bearer(reviewer))
        .send({ decision: 'REJECT' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/reviews/contribution/:contributionId', () => {
    it('returns reviews with an aggregate summary', async () => {
      prisma.contribution.findUnique.mockResolvedValue(contribution);
      prisma.review.findMany
        .mockResolvedValueOnce([review])
        .mockResolvedValueOnce([
          { decision: 'APPROVE', rating: 5 },
          { decision: 'REJECT', rating: 3 },
        ]);
      prisma.review.count.mockResolvedValue(2);

      const res = await request(app).get(
        `/api/v1/reviews/contribution/${CONTRIBUTION_ID}`
      );

      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({
        APPROVE: 1,
        REJECT: 1,
        totalReviews: 2,
        averageRating: 4,
      });
    });
  });

  describe('GET /api/v1/reviews/me', () => {
    it('lists only the caller reviews', async () => {
      prisma.review.findMany.mockResolvedValue([review]);
      prisma.review.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/reviews/me')
        .set('Authorization', bearer(reviewer));

      expect(res.status).toBe(200);
      expect(prisma.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ reviewerId: reviewer.id }) })
      );
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/v1/reviews/me');

      expect(res.status).toBe(401);
    });
  });
});
