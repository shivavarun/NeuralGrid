/**
 * API_Gateway Express server — Port 8080
 * Mounts all routes with auth, rate-limit, validation middleware chain.
 * Consistent error handling for unhandled errors.
 */

import express, { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { ErrorCode, ERROR_HTTP_STATUS, createErrorResponse } from '@neuralgrid/shared';
import { createAuthMiddleware, KeyStore, ApiKeyRecord } from './middleware/auth';
import { createRateLimitMiddleware } from './middleware/rateLimit';
import { createValidationMiddleware, ModelLookup } from './middleware/validation';
import { createJobsRouter } from './routes/jobs';
import { createModelsRouter, loadModelRegistry } from './routes/models';
import { createKeysRouter } from './routes/keys';
import { createDefaultIdempotencyDeps } from './middleware/idempotency';

// --- In-memory key store (MVP) ---

const inMemoryKeys: Map<string, ApiKeyRecord> = new Map();

export const mvpKeyStore: KeyStore = {
  async findActiveKeyByHash(hash: string): Promise<ApiKeyRecord | null> {
    return inMemoryKeys.get(hash) || null;
  },
};

/** Register a key hash for MVP testing */
export function registerApiKey(hash: string, record: ApiKeyRecord): void {
  inMemoryKeys.set(hash, record);
}

// --- Model lookup for validation middleware ---

function createModelLookup(): ModelLookup {
  return (id: string) => {
    try {
      const registry = loadModelRegistry();
      return registry.models[id] as any;
    } catch {
      return undefined;
    }
  };
}

// --- Redis client ---

function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  return new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });
}

// --- Create Express app ---

export function createApp(options?: {
  keyStore?: KeyStore;
  redis?: Redis;
  modelLookup?: ModelLookup;
}) {
  const app = express();
  const keyStore = options?.keyStore || mvpKeyStore;
  const redis = options?.redis || createRedisClient();
  const modelLookup = options?.modelLookup || createModelLookup();

  // Body parsing
  app.use(express.json());

  // Health check (no auth)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'api-gateway' });
  });

  // Auth middleware on /v1/* routes
  const authMiddleware = createAuthMiddleware(keyStore);
  app.use('/v1', authMiddleware);

  // Rate limit middleware on /v1/* routes
  const rateLimitMiddleware = createRateLimitMiddleware({ redis });
  app.use('/v1', rateLimitMiddleware);

  // Validation middleware on POST /v1/jobs only
  const validationMiddleware = createValidationMiddleware(modelLookup);
  app.post('/v1/jobs', validationMiddleware);

  // Mount routes
  const jobsRouter = createJobsRouter({
    idempotency: createDefaultIdempotencyDeps(redis),
  });
  app.use(jobsRouter);

  const modelsRouter = createModelsRouter();
  app.use(modelsRouter);

  const keysRouter = createKeysRouter();
  app.use(keysRouter);

  // Global error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err.message);
    const status = ERROR_HTTP_STATUS[ErrorCode.INTERNAL_ERROR];
    res.status(status).json(
      createErrorResponse(ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred')
    );
  });

  return app;
}

// --- Start server if run directly ---

const app = createApp();
const PORT = process.env.PORT || 8080;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`API Gateway listening on port ${PORT}`);
  });
}

export default app;
