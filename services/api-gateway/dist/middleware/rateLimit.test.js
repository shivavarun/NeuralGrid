"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rateLimit_1 = require("./rateLimit");
const shared_1 = require("@neuralgrid/shared");
function createMockRedis(state = {}) {
    return {
        incr: vitest_1.vi.fn(async (key) => {
            state[key] = (state[key] || 0) + 1;
            return state[key];
        }),
        expire: vitest_1.vi.fn(async () => 1),
        ttl: vitest_1.vi.fn(async () => 55),
    };
}
function createMockReqRes(keyPrefix = 'ng_abc1234') {
    const req = { developer: { key_prefix: keyPrefix } };
    const res = {
        status: vitest_1.vi.fn().mockReturnThis(),
        json: vitest_1.vi.fn().mockReturnThis(),
        setHeader: vitest_1.vi.fn(),
    };
    const next = vitest_1.vi.fn();
    return { req, res, next };
}
(0, vitest_1.describe)('rateLimit middleware', () => {
    (0, vitest_1.it)('allows request under limit and sets headers', async () => {
        const redis = createMockRedis();
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis, maxRequests: 100 });
        const { req, res, next } = createMockReqRes();
        await middleware(req, res, next);
        (0, vitest_1.expect)(next).toHaveBeenCalled();
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', 55);
        (0, vitest_1.expect)(redis.incr).toHaveBeenCalledWith('rate_limit:ng_abc1234');
    });
    (0, vitest_1.it)('sets TTL on first request (count === 1)', async () => {
        const redis = createMockRedis();
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis, maxRequests: 100, windowSeconds: 60 });
        const { req, res, next } = createMockReqRes();
        await middleware(req, res, next);
        (0, vitest_1.expect)(redis.expire).toHaveBeenCalledWith('rate_limit:ng_abc1234', 60);
    });
    (0, vitest_1.it)('does NOT set TTL when count > 1', async () => {
        const state = { 'rate_limit:ng_abc1234': 5 };
        const redis = createMockRedis(state);
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis, maxRequests: 100 });
        const { req, res, next } = createMockReqRes();
        await middleware(req, res, next);
        // count is now 6, not 1
        (0, vitest_1.expect)(redis.expire).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('returns 429 when limit exceeded', async () => {
        const state = { 'rate_limit:ng_abc1234': 100 };
        const redis = createMockRedis(state);
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis, maxRequests: 100 });
        const { req, res, next } = createMockReqRes();
        await middleware(req, res, next);
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(429);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            error: vitest_1.expect.objectContaining({ code: shared_1.ErrorCode.RATE_LIMIT_EXCEEDED }),
        }));
    });
    (0, vitest_1.it)('sets X-RateLimit-Remaining to 0 when over limit', async () => {
        const state = { 'rate_limit:ng_abc1234': 105 };
        const redis = createMockRedis(state);
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis, maxRequests: 100 });
        const { req, res, next } = createMockReqRes();
        await middleware(req, res, next);
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    });
    (0, vitest_1.it)('skips rate limiting when no developer on request', async () => {
        const redis = createMockRedis();
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis });
        const req = {};
        const res = { setHeader: vitest_1.vi.fn(), status: vitest_1.vi.fn().mockReturnThis(), json: vitest_1.vi.fn() };
        const next = vitest_1.vi.fn();
        await middleware(req, res, next);
        (0, vitest_1.expect)(next).toHaveBeenCalled();
        (0, vitest_1.expect)(redis.incr).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('fails open when Redis throws', async () => {
        const redis = {
            incr: vitest_1.vi.fn(async () => { throw new Error('Redis down'); }),
            expire: vitest_1.vi.fn(),
            ttl: vitest_1.vi.fn(),
        };
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis });
        const { req, res, next } = createMockReqRes();
        await middleware(req, res, next);
        (0, vitest_1.expect)(next).toHaveBeenCalled();
    });
    (0, vitest_1.it)('uses custom maxRequests from options', async () => {
        const redis = createMockRedis();
        const middleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis, maxRequests: 5 });
        const { req, res, next } = createMockReqRes();
        await middleware(req, res, next);
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
        (0, vitest_1.expect)(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
    });
});
//# sourceMappingURL=rateLimit.test.js.map