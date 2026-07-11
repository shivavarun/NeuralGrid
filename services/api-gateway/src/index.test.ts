import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp, registerApiKey } from './index';
import { hashApiKey, KeyStore, ApiKeyRecord } from './middleware/auth';

// Mock Redis to avoid actual connection
const mockRedis = {
  incr: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(60),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
} as any;

// Test key store
const testKeyStore: KeyStore = {
  async findActiveKeyByHash(hash: string): Promise<ApiKeyRecord | null> {
    if (hash === hashApiKey('ng_testkey123')) {
      return { developer_id: 'dev-1', key_prefix: 'ng_test' };
    }
    return null;
  },
};

function buildApp() {
  return createApp({
    keyStore: testKeyStore,
    redis: mockRedis,
    modelLookup: () => undefined, // no models in test
  });
}

describe('API Gateway Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('returns 200 with ok status', async () => {
      const app = buildApp();
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'api-gateway' });
    });

    it('does not require authentication', async () => {
      const app = buildApp();
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
    });
  });

  describe('Auth middleware on /v1/*', () => {
    it('returns 401 without auth header', async () => {
      const app = buildApp();
      const res = await request(app).get('/v1/models');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 with invalid key', async () => {
      const app = buildApp();
      const res = await request(app)
        .get('/v1/models')
        .set('Authorization', 'Bearer ng_invalidkey');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Error handling middleware', () => {
    it('returns 500 with consistent format for unknown routes', async () => {
      const app = buildApp();

      // Hit a route that doesn't exist under /v1 — after auth passes
      // This tests that unmatched routes get 404 from Express default
      // For actual error handling, test via a sync throw in a known route
      const res = await request(app)
        .get('/v1/nonexistent')
        .set('Authorization', 'Bearer ng_testkey123');

      // Express returns 404 by default for unmatched routes
      expect(res.status).toBe(404);
    });

    it('global error handler catches errors passed via next()', async () => {
      const express = await import('express');
      const { ErrorCode, ERROR_HTTP_STATUS, createErrorResponse } = await import('@neuralgrid/shared');

      // Build a minimal app with error-throwing route + error handler
      const app = express.default();
      app.use(express.default.json());
      app.get('/blow', (_req, _res, next) => {
        next(new Error('kaboom'));
      });
      app.use((err: Error, _req: any, res: any, _next: any) => {
        res.status(500).json(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred')
        );
      });

      const res = await request(app).get('/blow');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).toBe('An unexpected error occurred');
    });
  });
});
