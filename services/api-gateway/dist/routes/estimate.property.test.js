"use strict";
/**
 * Property 13: Cost Estimate Response Completeness
 * For any valid estimate request, the response SHALL contain tier, min_vram_gb,
 * estimated_runtime_seconds, estimated_cost_usd, confidence, and a vs_runpod_a100
 * comparison where saving_pct = (runpod_cost - estimated_cost) / runpod_cost × 100.
 *
 * Validates: Requirements 4.1, 4.2
 * Feature: neuralgrid-mvp, Property 13: Cost Estimate Response Completeness
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const estimate_1 = require("./estimate");
// Valid model IDs from registry
const VALID_MODELS = [
    'llama-3-8b', 'llama-3-13b', 'llama-3-70b',
    'mistral-7b', 'mixtral-8x7b', 'gemma-7b',
    'phi-3-mini', 'qwen2-7b', 'stable-diffusion-xl',
];
const TIERS = ['T1', 'T2', 'T3'];
const CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'];
function makeApp(httpClient) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    const router = (0, estimate_1.createEstimateRouter)({ httpClient });
    app.use(router);
    return app;
}
(0, vitest_1.describe)('Property 13: Cost Estimate Response Completeness', () => {
    (0, vitest_1.it)('response contains all required fields for any valid estimate', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.constantFrom(...VALID_MODELS), fast_check_1.default.constantFrom(...TIERS), fast_check_1.default.constantFrom(...CONFIDENCES), fast_check_1.default.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }), // min_vram_gb
        fast_check_1.default.float({ min: Math.fround(1), max: Math.fround(3600), noNaN: true }), // runtime_seconds
        fast_check_1.default.float({ min: Math.fround(0.0001), max: Math.fround(5), noNaN: true }), // estimated_cost
        async (modelId, tier, confidence, minVram, runtimeSeconds, estimatedCost) => {
            const costStr = estimatedCost.toFixed(6);
            const httpClient = {
                post: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        tier,
                        min_vram_gb: minVram,
                        estimated_runtime_seconds: runtimeSeconds,
                        estimated_cost_usd: costStr,
                        confidence,
                    },
                }),
            };
            const app = makeApp(httpClient);
            const res = await (0, supertest_1.default)(app)
                .get(`/v1/models/${modelId}/estimate`)
                .query({ input_tokens: 1000, max_tokens: 500 });
            // Must be 200
            (0, vitest_1.expect)(res.status).toBe(200);
            const body = res.body;
            // All required fields present
            (0, vitest_1.expect)(body).toHaveProperty('tier');
            (0, vitest_1.expect)(body).toHaveProperty('min_vram_gb');
            (0, vitest_1.expect)(body).toHaveProperty('estimated_runtime_seconds');
            (0, vitest_1.expect)(body).toHaveProperty('estimated_cost_usd');
            (0, vitest_1.expect)(body).toHaveProperty('confidence');
            (0, vitest_1.expect)(body).toHaveProperty('vs_runpod_a100');
            // Field values match input
            (0, vitest_1.expect)(body.tier).toBe(tier);
            (0, vitest_1.expect)(body.min_vram_gb).toBe(minVram);
            (0, vitest_1.expect)(body.estimated_runtime_seconds).toBe(runtimeSeconds);
            (0, vitest_1.expect)(body.estimated_cost_usd).toBe(costStr);
            (0, vitest_1.expect)(body.confidence).toBe(confidence);
            // vs_runpod_a100 sub-fields
            (0, vitest_1.expect)(body.vs_runpod_a100).toHaveProperty('runpod_cost_usd');
            (0, vitest_1.expect)(body.vs_runpod_a100).toHaveProperty('saving_pct');
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('saving_pct = (runpod_cost - estimated_cost) / runpod_cost × 100', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.constantFrom(...VALID_MODELS), fast_check_1.default.constantFrom(...TIERS), fast_check_1.default.float({ min: Math.fround(10), max: Math.fround(3600), noNaN: true }), // runtime_seconds (min 10 to avoid near-zero division)
        fast_check_1.default.float({ min: Math.fround(0.0001), max: Math.fround(5), noNaN: true }), // estimated_cost
        async (modelId, tier, runtimeSeconds, estimatedCost) => {
            const costStr = estimatedCost.toFixed(6);
            const httpClient = {
                post: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        tier,
                        min_vram_gb: 10,
                        estimated_runtime_seconds: runtimeSeconds,
                        estimated_cost_usd: costStr,
                        confidence: 'HIGH',
                    },
                }),
            };
            const app = makeApp(httpClient);
            const res = await (0, supertest_1.default)(app)
                .get(`/v1/models/${modelId}/estimate`)
                .query({ input_tokens: 1000, max_tokens: 500 });
            (0, vitest_1.expect)(res.status).toBe(200);
            const body = res.body;
            const runpodCost = estimate_1.RUNPOD_A100_RATE_PER_HOUR * (runtimeSeconds / 3600);
            const expectedSavingPct = ((runpodCost - estimatedCost) / runpodCost) * 100;
            const expectedRounded = Math.round(expectedSavingPct * 100) / 100;
            (0, vitest_1.expect)(body.vs_runpod_a100.saving_pct).toBeCloseTo(expectedRounded, 1);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=estimate.property.test.js.map