import { jest } from '@jest/globals';

// Mock Prisma before importing app
jest.unstable_mockModule('../../src/config/database.js', () => ({
  getPrismaClient: jest.fn(() => ({
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
  connectDatabase: jest.fn().mockResolvedValue(true),
  disconnectDatabase: jest.fn().mockResolvedValue(undefined),
  default: {
    getPrismaClient: jest.fn(),
    connectDatabase: jest.fn().mockResolvedValue(true),
    disconnectDatabase: jest.fn().mockResolvedValue(undefined),
  },
}));

const { default: request } = await import('supertest');
const { default: app } = await import('../../src/app.js');

describe('Health Check Endpoint', () => {
  describe('GET /api/v1/health', () => {
    it('should return 200 and healthy status when database is connected', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Server is running');
      expect(res.body.data).toHaveProperty('status', 'healthy');
      expect(res.body.data).toHaveProperty('database', 'connected');
      expect(res.body.data).toHaveProperty('timestamp');
      expect(res.body.data).toHaveProperty('uptime');
      expect(res.body.data).toHaveProperty('version', '1.0.0');
    });
  });

  describe('GET /api/v1/nonexistent', () => {
    it('should return 404 for undefined routes', async () => {
      const res = await request(app).get('/api/v1/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Route not found');
    });
  });

  describe('POST /api/v1/health', () => {
    it('should return 404 for unsupported methods on health endpoint', async () => {
      const res = await request(app).post('/api/v1/health');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});

describe('Error Handling', () => {
  it('should return JSON for 404 errors', async () => {
    const res = await request(app).get('/completely/random/path');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.success).toBe(false);
  });
});

describe('Security Headers', () => {
  it('should include security headers from Helmet', async () => {
    const res = await request(app).get('/api/v1/health');

    // Helmet adds various security headers
    expect(res.headers).toHaveProperty('x-content-type-options');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('API Response Format', () => {
  it('should return consistent success response format', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.body).toHaveProperty('success');
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.success).toBe('boolean');
    expect(typeof res.body.message).toBe('string');
  });

  it('should return consistent error response format', async () => {
    const res = await request(app).get('/api/v1/nonexistent');

    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('message');
    expect(typeof res.body.message).toBe('string');
  });
});
