"use strict";
/**
 * Property 8: Budget Exceeded Detection
 * For any job where estimated_cost > developer.max_cost_usd, verify 400 BUDGET_EXCEEDED.
 *
 * Validates: Requirements 1.4
 * Feature: neuralgrid-mvp, Property 8: Budget Exceeded Detection
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const jobs_1 = require("./jobs");
function makeApp(deps) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // Simulate auth middleware
    app.use((req, _res, next) => {
        req.developerId = deps.developer.id;
        next();
    });
    const getDeveloper = vitest_1.vi.fn().mockResolvedValue(deps.developer);
    const router = (0, jobs_1.createJobsRouter)({ getDeveloper, httpClient: deps.httpClient });
    app.use(router);
    return app;
}
const validBody = {
    model: 'llama-3-8b',
    input: { type: 'text', content: 'Hello' },
    output: { type: 'text', max_tokens: 100 },
};
(0, vitest_1.describe)('Property 8: Budget Exceeded Detection', () => {
    (0, vitest_1.it)('returns 400 BUDGET_EXCEEDED when estimated_cost > max_cost_usd', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(
        // max_cost_usd: positive float 0.01-100
        fast_check_1.default.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }), 
        // delta: positive amount that cost exceeds budget
        fast_check_1.default.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }), async (maxCost, delta) => {
            const estimatedCost = maxCost + delta;
            const developer = {
                id: 'dev_prop8',
                max_cost_usd: maxCost,
                payment_status: 'active',
            };
            const httpClient = {
                post: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        tier: 'T1',
                        min_vram_gb: 10,
                        estimated_runtime_seconds: 30,
                        estimated_cost_usd: estimatedCost.toFixed(6),
                        confidence: 'HIGH',
                    },
                }),
                get: vitest_1.vi.fn(),
            };
            const app = makeApp({ developer, httpClient });
            const res = await (0, supertest_1.default)(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);
            (0, vitest_1.expect)(res.status).toBe(400);
            (0, vitest_1.expect)(res.body.error.code).toBe('BUDGET_EXCEEDED');
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('does NOT return BUDGET_EXCEEDED when estimated_cost <= max_cost_usd', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(
        // max_cost_usd: positive float 1-100
        fast_check_1.default.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }), 
        // ratio: 0 to 1 so cost <= max
        fast_check_1.default.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }), async (maxCost, ratio) => {
            const estimatedCost = maxCost * ratio;
            const developer = {
                id: 'dev_prop8_inv',
                max_cost_usd: maxCost,
                payment_status: 'active',
            };
            const mockNode = {
                provider: 'vastai',
                node_id: 'v1',
                gpu_model: 'RTX 3090',
                vram_gb: 24,
                hourly_rate_usd: 0.3,
                availability: true,
            };
            const httpClient = {
                post: vitest_1.vi.fn()
                    .mockResolvedValueOnce({
                    status: 200,
                    data: {
                        tier: 'T1',
                        min_vram_gb: 10,
                        estimated_runtime_seconds: 30,
                        estimated_cost_usd: estimatedCost.toFixed(6),
                        confidence: 'HIGH',
                    },
                })
                    .mockResolvedValueOnce({ status: 202, data: {} }), // dispatch
                get: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        nodes: [mockNode],
                        cached: false,
                        cache_age_seconds: 0,
                    },
                }),
            };
            const app = makeApp({ developer, httpClient });
            const res = await (0, supertest_1.default)(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);
            // Should NOT be BUDGET_EXCEEDED
            (0, vitest_1.expect)(res.status).not.toBe(400);
            if (res.body.error) {
                (0, vitest_1.expect)(res.body.error.code).not.toBe('BUDGET_EXCEEDED');
            }
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=jobs.property.test.js.map