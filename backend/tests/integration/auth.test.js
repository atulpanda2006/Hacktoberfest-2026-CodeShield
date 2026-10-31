import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { createPrismaMock, resetPrismaMock, databaseModuleMock } from '../helpers/mockPrisma.js';

const prisma = createPrismaMock();

jest.unstable_mockModule('../../src/config/database.js', () => databaseModuleMock(prisma));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');
const { default: env } = await import('../../src/config/env.js');

const TEST_PASSWORD = 'SecurePass123';
const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);

const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  username: 'testuser',
  email: 'test@example.com',
  passwordHash,
  role: 'DEVELOPER',
  accountStatus: 'ACTIVE',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const OTHER_USER_ID = '6f9619ff-8b86-4d01-b42d-00c04fc964ff';

function generateTestToken(userId) {
  return jwt.sign({ userId }, env.jwt.secret, { expiresIn: '1h' });
}

/**
 * The authenticate middleware loads the requester by id. Tests that also look up
 * a different user can resolve both through this helper.
 */
function mockUserLookups({ requester = mockUser, others = {} } = {}) {
  prisma.user.findUnique.mockImplementation(async ({ where }) => {
    if (where.id && others[where.id] !== undefined) return others[where.id];
    if (where.id && requester && where.id === requester.id) return requester;
    if (where.username && requester && where.username === requester.username) return requester;
    if (where.email && requester && where.email === requester.email) return requester;
    return null;
  });
}

describe('Authentication Module', () => {
  beforeEach(() => {
    resetPrismaMock(prisma);
  });

  describe('POST /api/v1/auth/register', () => {
    const validPayload = {
      username: 'newuser',
      email: 'newuser@example.com',
      password: TEST_PASSWORD,
      role: 'DEVELOPER',
    };

    it('should register a new user successfully', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        role: mockUser.role,
        accountStatus: mockUser.accountStatus,
        createdAt: mockUser.createdAt,
      });

      const res = await request(app).post('/api/v1/auth/register').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: validPayload.username,
            email: validPayload.email,
            passwordHash: expect.any(String),
            role: validPayload.role,
          }),
        })
      );

      // The stored hash must never be the plain-text password
      const storedHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
      expect(storedHash).not.toBe(TEST_PASSWORD);
      expect(await bcrypt.compare(TEST_PASSWORD, storedHash)).toBe(true);
    });

    it('should return 409 for duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app).post('/api/v1/auth/register').send(validPayload);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Email already registered');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ username: 'incomplete' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.errors).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        username: 'testuser',
        email: 'not-an-email',
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].field).toBe('email');
    });

    it('should return 400 for weak password', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        username: 'testuser',
        email: 'test@example.com',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].field).toBe('password');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const loginPayload = { email: 'test@example.com', password: TEST_PASSWORD };

    it('should login successfully and return JWT', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app).post('/api/v1/auth/login').send(loginPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Login successful');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('should return 401 for invalid credentials (user not found)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).post('/api/v1/auth/login').send(loginPayload);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should return 401 for wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ ...loginPayload, password: 'WrongPassword123' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should return 403 for inactive account', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, accountStatus: 'SUSPENDED' });

      const res = await request(app).post('/api/v1/auth/login').send(loginPayload);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('not active');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user with valid token', async () => {
      mockUserLookups();

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(mockUser.id);
      expect(res.body.data.user.email).toBe(mockUser.email);
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 401 for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${generateTestToken(OTHER_USER_ID)}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 403 for a suspended account holding a valid token', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, accountStatus: 'SUSPENDED' });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      mockUserLookups();

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Logged out successfully');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).post('/api/v1/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should return user by ID', async () => {
      // Prisma only returns the columns in `select`; the mock mirrors that projection.
      prisma.user.findUnique.mockResolvedValue({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        role: mockUser.role,
        accountStatus: mockUser.accountStatus,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });

      const res = await request(app).get(`/api/v1/users/${mockUser.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.id).toBe(mockUser.id);
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      const query = prisma.user.findUnique.mock.calls[0][0];
      expect(query.select).not.toHaveProperty('passwordHash');
    });

    it('should return 404 for non-existent user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/v1/users/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('User not found');
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    it('should update user profile when authorized (own profile)', async () => {
      mockUserLookups();
      prisma.user.update.mockResolvedValue({
        id: mockUser.id,
        username: 'updateduser',
        email: mockUser.email,
        role: mockUser.role,
        accountStatus: mockUser.accountStatus,
        updatedAt: new Date(),
      });

      const res = await request(app)
        .put(`/api/v1/users/${mockUser.id}`)
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`)
        .send({ username: 'updateduser' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.username).toBe('updateduser');
    });

    it('should return 403 when updating another user\'s profile', async () => {
      mockUserLookups({ others: { [OTHER_USER_ID]: { ...mockUser, id: OTHER_USER_ID } } });

      const res = await request(app)
        .put(`/api/v1/users/${OTHER_USER_ID}`)
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`)
        .send({ username: 'hacked' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('You can only update your own profile');
    });

    it('should return 404 for non-existent user', async () => {
      mockUserLookups();
      prisma.user.update.mockResolvedValue(null);

      const res = await request(app)
        .put(`/api/v1/users/${OTHER_USER_ID}`)
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`)
        .send({ username: 'updateduser' });

      // The requester is authenticated, but the target user does not exist.
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid update data', async () => {
      mockUserLookups();

      const res = await request(app)
        .put(`/api/v1/users/${mockUser.id}`)
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`)
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should not allow a non-admin to escalate their own role', async () => {
      mockUserLookups();
      prisma.user.update.mockResolvedValue({
        id: mockUser.id,
        username: mockUser.username,
        email: mockUser.email,
        role: 'DEVELOPER',
        accountStatus: 'ACTIVE',
        updatedAt: new Date(),
      });

      const res = await request(app)
        .put(`/api/v1/users/${mockUser.id}`)
        .set('Authorization', `Bearer ${generateTestToken(mockUser.id)}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(200);
      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.data).not.toHaveProperty('role');
    });
  });
});
