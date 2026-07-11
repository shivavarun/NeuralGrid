import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { createRateLimitMiddleware } from './rateLimit';
import { ErrorCode } from '@neuralgrid/shared';

function createMockRedis(state: Record<string, number> = {}) {
  return {
    incr: vi.fn(async (key: string) => {
      state[key] = (state[key] || 0) + 1;
      return state[key];
    }),
    expire: vi.fn(async () => 1),
    ttl: vi.fn(async () => 55),
  } as any;
}

function createMockReqRes(keyPrefix = 'ng_abc1234') {
  const req = { developer: { key_prefix: keyPrefix } } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
  } as any;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

describe('rateLimit middleware', () => {
  it('allows request under limit and sets headers', async () => {
    const redis = createMockRedis();
    const middleware = createRateLimitMiddleware({ redis, maxRequests: 100 });
    const { req, res, next } = createMockReqRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', 55);
    expect(redis.incr).toHaveBeenCalledWith('rate_limit:ng_abc1234');
  });

  it('sets TTL on first request (count === 1)', async () => {
    const redis = createMockRedis();
    const middleware = createRateLimitMiddleware({ redis, maxRequests: 100, windowSeconds: 60 });
    const { req, res, next } = createMockReqRes();

    await middleware(req, res, next);

    expect(redis.expire).toHaveBeenCalledWith('rate_limit:ng_abc1234', 60);
  });

  it('does NOT set TTL when count > 1', async () => {
    const state: Record<string, number> = { 'rate_limit:ng_abc1234': 5 };
    const redis = createMockRedis(state);
    const middleware = createRateLimitMiddleware({ redis, maxRequests: 100 });
    const { req, res, next } = createMockReqRes();

    await middleware(req, res, next);

    // count is now 6, not 1
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('returns 429 when limit exceeded', async () => {
    const state: Record<string, number> = { 'rate_limit:ng_abc1234': 100 };
    const redis = createMockRedis(state);
    const middleware = createRateLimitMiddleware({ redis, maxRequests: 100 });
    const { req, res, next } = createMockReqRes();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: ErrorCode.RATE_LIMIT_EXCEEDED }),
      })
    );
  });

  it('sets X-RateLimit-Remaining to 0 when over limit', async () => {
    const state: Record<string, number> = { 'rate_limit:ng_abc1234': 105 };
    const redis = createMockRedis(state);
    const middleware = createRateLimitMiddleware({ redis, maxRequests: 100 });
    const { req, res, next } = createMockReqRes();

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
  });

  it('skips rate limiting when no developer on request', async () => {
    const redis = createMockRedis();
    const middleware = createRateLimitMiddleware({ redis });
    const req = {} as any;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('fails open when Redis throws', async () => {
    const redis = {
      incr: vi.fn(async () => { throw new Error('Redis down'); }),
      expire: vi.fn(),
      ttl: vi.fn(),
    } as any;
    const middleware = createRateLimitMiddleware({ redis });
    const { req, res, next } = createMockReqRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('uses custom maxRequests from options', async () => {
    const redis = createMockRedis();
    const middleware = createRateLimitMiddleware({ redis, maxRequests: 5 });
    const { req, res, next } = createMockReqRes();

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
  });
});
