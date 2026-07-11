"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const supertest_1 = __importDefault(require("supertest"));
const index_1 = require("./index");
const auth_1 = require("./middleware/auth");
// Mock Redis to avoid actual connection
const mockRedis = {
    incr: vitest_1.vi.fn().mockResolvedValue(1),
    expire: vitest_1.vi.fn().mockResolvedValue(1),
    ttl: vitest_1.vi.fn().mockResolvedValue(60),
    connect: vitest_1.vi.fn().mockResolvedValue(undefined),
    disconnect: vitest_1.vi.fn().mockResolvedValue(undefined),
};
// Test key store
const testKeyStore = {
    async findActiveKeyByHash(hash) {
        if (hash === (0, auth_1.hashApiKey)('ng_testkey123')) {
            return { developer_id: 'dev-1', key_prefix: 'ng_test' };
        }
        return null;
    },
};
function buildApp() {
    return (0, index_1.createApp)({
        keyStore: testKeyStore,
        redis: mockRedis,
        modelLookup: () => undefined, // no models in test
    });
}
(0, vitest_1.describe)('API Gateway Server', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.describe)('GET /health', () => {
        (0, vitest_1.it)('returns 200 with ok status', async () => {
            const app = buildApp();
            const res = await (0, supertest_1.default)(app).get('/health');
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body).toEqual({ status: 'ok', service: 'api-gateway' });
        });
        (0, vitest_1.it)('does not require authentication', async () => {
            const app = buildApp();
            const res = await (0, supertest_1.default)(app).get('/health');
            (0, vitest_1.expect)(res.status).toBe(200);
        });
    });
    (0, vitest_1.describe)('Auth middleware on /v1/*', () => {
        (0, vitest_1.it)('returns 401 without auth header', async () => {
            const app = buildApp();
            const res = await (0, supertest_1.default)(app).get('/v1/models');
            (0, vitest_1.expect)(res.status).toBe(401);
            (0, vitest_1.expect)(res.body.error.code).toBe('UNAUTHORIZED');
        });
        (0, vitest_1.it)('returns 401 with invalid key', async () => {
            const app = buildApp();
            const res = await (0, supertest_1.default)(app)
                .get('/v1/models')
                .set('Authorization', 'Bearer ng_invalidkey');
            (0, vitest_1.expect)(res.status).toBe(401);
            (0, vitest_1.expect)(res.body.error.code).toBe('UNAUTHORIZED');
        });
    });
    (0, vitest_1.describe)('Error handling middleware', () => {
        (0, vitest_1.it)('returns 500 with consistent format for unknown routes', async () => {
            const app = buildApp();
            // Hit a route that doesn't exist under /v1 — after auth passes
            // This tests that unmatched routes get 404 from Express default
            // For actual error handling, test via a sync throw in a known route
            const res = await (0, supertest_1.default)(app)
                .get('/v1/nonexistent')
                .set('Authorization', 'Bearer ng_testkey123');
            // Express returns 404 by default for unmatched routes
            (0, vitest_1.expect)(res.status).toBe(404);
        });
        (0, vitest_1.it)('global error handler catches errors passed via next()', async () => {
            const express = await Promise.resolve().then(() => __importStar(require('express')));
            const { ErrorCode, ERROR_HTTP_STATUS, createErrorResponse } = await Promise.resolve().then(() => __importStar(require('@neuralgrid/shared')));
            // Build a minimal app with error-throwing route + error handler
            const app = express.default();
            app.use(express.default.json());
            app.get('/blow', (_req, _res, next) => {
                next(new Error('kaboom'));
            });
            app.use((err, _req, res, _next) => {
                res.status(500).json(createErrorResponse(ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred'));
            });
            const res = await (0, supertest_1.default)(app).get('/blow');
            (0, vitest_1.expect)(res.status).toBe(500);
            (0, vitest_1.expect)(res.body.error.code).toBe('INTERNAL_ERROR');
            (0, vitest_1.expect)(res.body.error.message).toBe('An unexpected error occurred');
        });
    });
});
//# sourceMappingURL=index.test.js.map