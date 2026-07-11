"use strict";
/**
 * API_Gateway Express server — Port 8080
 * Mounts all routes with auth, rate-limit, validation middleware chain.
 * Consistent error handling for unhandled errors.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mvpKeyStore = void 0;
exports.registerApiKey = registerApiKey;
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const ioredis_1 = __importDefault(require("ioredis"));
const shared_1 = require("@neuralgrid/shared");
const auth_1 = require("./middleware/auth");
const rateLimit_1 = require("./middleware/rateLimit");
const validation_1 = require("./middleware/validation");
const jobs_1 = require("./routes/jobs");
const models_1 = require("./routes/models");
const keys_1 = require("./routes/keys");
const idempotency_1 = require("./middleware/idempotency");
// --- In-memory key store (MVP) ---
const inMemoryKeys = new Map();
exports.mvpKeyStore = {
    async findActiveKeyByHash(hash) {
        return inMemoryKeys.get(hash) || null;
    },
};
/** Register a key hash for MVP testing */
function registerApiKey(hash, record) {
    inMemoryKeys.set(hash, record);
}
// --- Model lookup for validation middleware ---
function createModelLookup() {
    return (id) => {
        try {
            const registry = (0, models_1.loadModelRegistry)();
            return registry.models[id];
        }
        catch {
            return undefined;
        }
    };
}
// --- Redis client ---
function createRedisClient() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    return new ioredis_1.default(redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
    });
}
// --- Create Express app ---
function createApp(options) {
    const app = (0, express_1.default)();
    const keyStore = options?.keyStore || exports.mvpKeyStore;
    const redis = options?.redis || createRedisClient();
    const modelLookup = options?.modelLookup || createModelLookup();
    // Body parsing
    app.use(express_1.default.json());
    // Health check (no auth)
    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok', service: 'api-gateway' });
    });
    // Auth middleware on /v1/* routes
    const authMiddleware = (0, auth_1.createAuthMiddleware)(keyStore);
    app.use('/v1', authMiddleware);
    // Rate limit middleware on /v1/* routes
    const rateLimitMiddleware = (0, rateLimit_1.createRateLimitMiddleware)({ redis });
    app.use('/v1', rateLimitMiddleware);
    // Validation middleware on POST /v1/jobs only
    const validationMiddleware = (0, validation_1.createValidationMiddleware)(modelLookup);
    app.post('/v1/jobs', validationMiddleware);
    // Mount routes
    const jobsRouter = (0, jobs_1.createJobsRouter)({
        idempotency: (0, idempotency_1.createDefaultIdempotencyDeps)(redis),
    });
    app.use(jobsRouter);
    const modelsRouter = (0, models_1.createModelsRouter)();
    app.use(modelsRouter);
    const keysRouter = (0, keys_1.createKeysRouter)();
    app.use(keysRouter);
    // Global error handling middleware
    app.use((err, _req, res, _next) => {
        console.error('Unhandled error:', err.message);
        const status = shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.INTERNAL_ERROR];
        res.status(status).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred'));
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
exports.default = app;
//# sourceMappingURL=index.js.map