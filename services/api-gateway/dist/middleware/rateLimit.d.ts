import { Request, Response, NextFunction } from 'express';
import type { Redis } from 'ioredis';
export interface RateLimitOptions {
    redis: Redis;
    maxRequests?: number;
    windowSeconds?: number;
}
/**
 * Rate limiting middleware.
 * Tracks requests per API key prefix in Redis with sliding window.
 * Must run AFTER auth middleware (expects req.developer with key_prefix).
 */
export declare function createRateLimitMiddleware(options: RateLimitOptions): (req: Request, res: Response, next: NextFunction) => Promise<void>;
