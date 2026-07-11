"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRateLimitMiddleware = createRateLimitMiddleware;
const shared_1 = require("@neuralgrid/shared");
const shared_2 = require("@neuralgrid/shared");
const DEFAULT_RATE_LIMIT_MAX = 100;
/**
 * Rate limiting middleware.
 * Tracks requests per API key prefix in Redis with sliding window.
 * Must run AFTER auth middleware (expects req.developer with key_prefix).
 */
function createRateLimitMiddleware(options) {
    const { redis, maxRequests = parseInt(process.env.RATE_LIMIT_MAX || String(DEFAULT_RATE_LIMIT_MAX), 10), windowSeconds = shared_2.RATE_LIMIT_WINDOW_SECONDS, } = options;
    return async (req, res, next) => {
        const developer = req.developer;
        if (!developer || !developer.key_prefix) {
            // No auth info — skip rate limiting (auth middleware should have rejected)
            next();
            return;
        }
        const key = `rate_limit:${developer.key_prefix}`;
        try {
            const current = await redis.incr(key);
            // Set TTL on first request in window
            if (current === 1) {
                await redis.expire(key, windowSeconds);
            }
            const ttl = await redis.ttl(key);
            const resetSeconds = ttl > 0 ? ttl : windowSeconds;
            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
            res.setHeader('X-RateLimit-Reset', resetSeconds);
            if (current > maxRequests) {
                const status = shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.RATE_LIMIT_EXCEEDED];
                res.status(status).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded. Try again later.'));
                return;
            }
            next();
        }
        catch (err) {
            // Redis failure — allow request through (fail open)
            next();
        }
    };
}
//# sourceMappingURL=rateLimit.js.map