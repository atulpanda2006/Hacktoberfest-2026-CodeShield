import { jest } from '@jest/globals';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';
import { TEST_USERS, bearer, mockRequester } from '../helpers/auth.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

const dev = TEST_USERS.developer;
const other = TEST_USERS.otherDeveloper;

const RELATIONSHIP_ID = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';

const relationship = {
  id: RELATIONSHIP_ID,
  sourceUserId: dev.id,
  targetUserId: other.id,
  trustLevel: 3,
  trustReason: 'Reviewed their work',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockUsers() {
  prisma.user.findUnique.mockImplementation(async ({ where }) =>
    where.id === dev.id ? dev : where.id === other.id ? other : null
  );
}

describe('Trust Relationships Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
    mockRequester(prisma, dev);
  });

  describe('POST /api/v1/trust', () => {
    it('creates a trust relationship backed by a shared repository', async () => {
      mockUsers();
      prisma.trustRelationship.findUnique.mockResolvedValue(null);
      prisma.repositoryMember.findFirst.mockResolvedValue({ repositoryId: 'repo-1' });
      prisma.trustRelationship.create.mockResolvedValue(relationship);

      const res = await request(app)
        .post('/api/v1/trust')
        .set('Authorization', bearer(dev))
        .send({ targetUserId: other.id, trustLevel: 3, trustReason: 'Reviewed their work' });

      expect(res.status).toBe(201);
      expect(res.body.data.relationship.trustLevelMeaning).toBe('Would collaborate again');
      expect(res.body.data.relationship.evidence).toContain('shared_repository');
    });

    it('prevents self trust', async () => {
      const res = await request(app)
        .post('/api/v1/trust')
        .set('Authorization', bearer(dev))
        .send({ targetUserId: dev.id, trustLevel: 2 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/themselves/i);
    });

    it('prevents duplicate relationships', async () => {
      mockUsers();
      prisma.trustRelationship.findUnique.mockResolvedValue({ id: RELATIONSHIP_ID });

      const res = await request(app)
        .post('/api/v1/trust')
        .set('Authorization', bearer(dev))
        .send({ targetUserId: other.id, trustLevel: 2 });

      expect(res.status).toBe(409);
    });

    it('requires an interaction trail', async () => {
      mockUsers();
      prisma.trustRelationship.findUnique.mockResolvedValue(null);
      prisma.repositoryMember.findFirst.mockResolvedValue(null);
      prisma.review.findFirst.mockResolvedValue(null);
      prisma.contribution.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/trust')
        .set('Authorization', bearer(dev))
        .send({ targetUserId: other.id, trustLevel: 5 });

      expect(res.status).toBe(403);
      expect(prisma.trustRelationship.create).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown target user', async () => {
      prisma.user.findUnique.mockImplementation(async ({ where }) =>
        where.id === dev.id ? dev : null
      );

      const res = await request(app)
        .post('/api/v1/trust')
        .set('Authorization', bearer(dev))
        .send({ targetUserId: other.id, trustLevel: 2 });

      expect(res.status).toBe(404);
    });

    it('validates the trust level range', async () => {
      const res = await request(app)
        .post('/api/v1/trust')
        .set('Authorization', bearer(dev))
        .send({ targetUserId: other.id, trustLevel: 9 });

      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('trustLevel');
    });
  });

  describe('GET /api/v1/trust/me', () => {
    it('returns given, received and mutual connections', async () => {
      prisma.trustRelationship.findMany
        .mockResolvedValueOnce([
          { ...relationship, targetUser: { id: other.id, username: 'devtwo', role: 'DEVELOPER' } },
        ])
        .mockResolvedValueOnce([
          {
            ...relationship,
            id: 'r2',
            sourceUserId: other.id,
            targetUserId: dev.id,
            sourceUser: { id: other.id, username: 'devtwo', role: 'DEVELOPER' },
          },
        ]);
      prisma.trustRelationship.count.mockResolvedValue(1);
      prisma.trustRelationship.aggregate.mockResolvedValue({ _avg: { trustLevel: 3 } });

      const res = await request(app)
        .get('/api/v1/trust/me')
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(200);
      expect(res.body.data.network.given).toHaveLength(1);
      expect(res.body.data.network.received).toHaveLength(1);
      expect(res.body.data.network.stats).toMatchObject({
        given: 1,
        received: 1,
        mutual: 1,
        averageReceivedLevel: 3,
      });
    });
  });

  describe('GET /api/v1/trust/:userId', () => {
    it('returns a public trust network', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: other.id, username: 'devtwo' });
      prisma.trustRelationship.findMany.mockResolvedValue([]);

      const res = await request(app).get(`/api/v1/trust/${other.id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.network.stats.given).toBe(0);
    });

    it('returns 404 for an unknown user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).get(`/api/v1/trust/${other.id}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/trust/:relationshipId', () => {
    it('lets the source developer update their endorsement', async () => {
      prisma.trustRelationship.findUnique.mockResolvedValue({
        id: RELATIONSHIP_ID,
        sourceUserId: dev.id,
      });
      prisma.trustRelationship.update.mockResolvedValue({ ...relationship, trustLevel: 5 });

      const res = await request(app)
        .patch(`/api/v1/trust/${RELATIONSHIP_ID}`)
        .set('Authorization', bearer(dev))
        .send({ trustLevel: 5 });

      expect(res.status).toBe(200);
      expect(res.body.data.relationship.trustLevel).toBe(5);
    });

    it('forbids updating someone else\'s endorsement', async () => {
      prisma.trustRelationship.findUnique.mockResolvedValue({
        id: RELATIONSHIP_ID,
        sourceUserId: other.id,
      });

      const res = await request(app)
        .patch(`/api/v1/trust/${RELATIONSHIP_ID}`)
        .set('Authorization', bearer(dev))
        .send({ trustLevel: 1 });

      expect(res.status).toBe(403);
    });

    it('rejects an empty update', async () => {
      const res = await request(app)
        .patch(`/api/v1/trust/${RELATIONSHIP_ID}`)
        .set('Authorization', bearer(dev))
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/trust/:relationshipId', () => {
    it('lets the source developer remove their endorsement', async () => {
      prisma.trustRelationship.findUnique.mockResolvedValue({
        id: RELATIONSHIP_ID,
        sourceUserId: dev.id,
      });
      prisma.trustRelationship.delete.mockResolvedValue({ id: RELATIONSHIP_ID });

      const res = await request(app)
        .delete(`/api/v1/trust/${RELATIONSHIP_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(204);
    });

    it('returns 404 for an unknown relationship', async () => {
      prisma.trustRelationship.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .delete(`/api/v1/trust/${RELATIONSHIP_ID}`)
        .set('Authorization', bearer(dev));

      expect(res.status).toBe(404);
    });
  });
});
