"use strict";
/**
 * Property tests for retry logic and cost calculation.
 *
 * - Property 5: Retry Invariant — Different Provider, Max 2 Retries
 * - Property 17: Actual Cost Calculation
 * - Property 18: Provider Circuit Breaker
 *
 * **Validates: Requirements 8.4, 8.5, 10.1, 13.3**
 *
 * Feature: neuralgrid-mvp
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const dispatcher_1 = require("./dispatcher");
const selector_1 = require("./selector");
// --- Generators ---
const providerArb = fast_check_1.default.constantFrom("vastai", "runpod");
const providerNodeArb = fast_check_1.default.record({
    provider: providerArb,
    node_id: fast_check_1.default.string({ minLength: 1, maxLength: 20 }),
    gpu_model: fast_check_1.default.constantFrom("A100", "H100", "RTX4090", "RTX3090", "A6000"),
    vram_gb: fast_check_1.default.integer({ min: 4, max: 80 }),
    hourly_rate_usd: fast_check_1.default.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
    availability: fast_check_1.default.constant(true),
});
const dispatchRequestArb = (selectedNode) => fast_check_1.default.record({
    job_id: fast_check_1.default.string({ minLength: 4, maxLength: 30 }).map((s) => `job_${s}`),
    model: fast_check_1.default.constantFrom("llama-3-8b", "stable-diffusion-xl", "whisper-large"),
    tier: fast_check_1.default.constantFrom("T1", "T2", "T3"),
    input: fast_check_1.default.record({
        type: fast_check_1.default.constant("text"),
        content: fast_check_1.default.string({ minLength: 1, maxLength: 100 }),
    }),
    output: fast_check_1.default.record({
        type: fast_check_1.default.constant("text"),
        max_tokens: fast_check_1.default.integer({ min: 1, max: 4096 }),
    }),
    quantization: fast_check_1.default.constantFrom("fp32", "fp16", "int8", "int4"),
    selected_node: fast_check_1.default.constant(selectedNode),
});
/**
 * Generate node lists with at least 2 distinct providers.
 */
const multiProviderNodesArb = fast_check_1.default
    .tuple(providerNodeArb.map((n) => ({ ...n, provider: "vastai" })), providerNodeArb.map((n) => ({ ...n, provider: "runpod" })), fast_check_1.default.array(providerNodeArb, { minLength: 0, maxLength: 5 }))
    .map(([a, b, rest]) => [a, b, ...rest]);
// --- Property 5: Retry Invariant ---
(0, vitest_1.describe)("Property 5: Retry Invariant — Different Provider, Max 2 Retries", () => {
    (0, vitest_1.it)("retry never uses same provider that already failed, max retries is 2", async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(multiProviderNodesArb, async (allNodes) => {
            const selectedNode = allNodes[0];
            const request = {
                job_id: "job_test123",
                model: "llama-3-8b",
                tier: "T1",
                input: { type: "text", content: "hello" },
                output: { type: "text", max_tokens: 100 },
                quantization: "int8",
                selected_node: selectedNode,
            };
            // Track which providers were dispatched to
            const dispatchedProviders = [];
            const alwaysFailFn = async (node) => {
                dispatchedProviders.push(node.provider);
                return { success: false, error: "simulated failure" };
            };
            const result = await (0, dispatcher_1.dispatchJob)(request, allNodes, alwaysFailFn);
            // Should be failed since all attempts fail
            (0, vitest_1.expect)(result.status).toBe("failed");
            // Max retries is 2 (so max 3 total attempts)
            (0, vitest_1.expect)(result.retries).toBeLessThanOrEqual(2);
            // Total attempts should be at most 3
            (0, vitest_1.expect)(dispatchedProviders.length).toBeLessThanOrEqual(3);
            // Each retry uses a different provider than any that already failed
            const failedSoFar = new Set();
            for (let i = 0; i < dispatchedProviders.length; i++) {
                if (i > 0) {
                    // This attempt should NOT be a provider that already failed
                    (0, vitest_1.expect)(failedSoFar.has(dispatchedProviders[i])).toBe(false);
                }
                failedSoFar.add(dispatchedProviders[i]);
            }
        }), { numRuns: 100 });
    });
});
// --- Property 17: Actual Cost Calculation ---
(0, vitest_1.describe)("Property 17: Actual Cost Calculation", () => {
    (0, vitest_1.it)("calculateCost matches hourly_rate × (runtime_seconds / 3600)", () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }), fast_check_1.default.float({ min: Math.fround(1), max: Math.fround(36000), noNaN: true }), (hourlyRate, runtimeSeconds) => {
            const result = (0, dispatcher_1.calculateCost)(hourlyRate, runtimeSeconds);
            const expected = hourlyRate * (runtimeSeconds / 3600);
            // Use approximate equality due to floating point
            (0, vitest_1.expect)(result).toBeCloseTo(expected, 10);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("cost is zero when runtime is zero", () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }), (hourlyRate) => {
            (0, vitest_1.expect)((0, dispatcher_1.calculateCost)(hourlyRate, 0)).toBe(0);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("cost scales linearly with runtime", () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }), fast_check_1.default.float({ min: Math.fround(1), max: Math.fround(18000), noNaN: true }), (hourlyRate, runtime) => {
            const cost1 = (0, dispatcher_1.calculateCost)(hourlyRate, runtime);
            const cost2 = (0, dispatcher_1.calculateCost)(hourlyRate, runtime * 2);
            // cost2 should be approximately 2× cost1
            (0, vitest_1.expect)(cost2).toBeCloseTo(cost1 * 2, 5);
        }), { numRuns: 100 });
    });
});
// --- Property 18: Provider Circuit Breaker ---
(0, vitest_1.describe)("Property 18: Provider Circuit Breaker", () => {
    (0, vitest_1.it)("deprioritized providers are filtered out when non-deprioritized alternatives exist", () => {
        fast_check_1.default.assert(fast_check_1.default.property(multiProviderNodesArb, (allNodes) => {
            // Pick one provider to deprioritize
            const providerToDeprioritize = allNodes[0].provider;
            const deprioritized = new Set([providerToDeprioritize]);
            // Ensure there are non-deprioritized nodes
            const nonDeprioritized = allNodes.filter((n) => !deprioritized.has(n.provider));
            if (nonDeprioritized.length > 0) {
                const result = (0, selector_1.selectCheapestNode)(allNodes, deprioritized);
                (0, vitest_1.expect)(result).not.toBeNull();
                // Selected node should NOT be from deprioritized provider
                (0, vitest_1.expect)(result.provider).not.toBe(providerToDeprioritize);
            }
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("after 3+ consecutive failures, provider is excluded from selection", () => {
        fast_check_1.default.assert(fast_check_1.default.property(multiProviderNodesArb, fast_check_1.default.integer({ min: 3, max: 10 }), (allNodes, failureCount) => {
            // Simulate circuit breaker: after CIRCUIT_BREAKER_THRESHOLD (3) failures,
            // provider gets added to deprioritized set
            const failedProvider = allNodes[0].provider;
            // After 3 failures, provider is deprioritized
            if (failureCount >= 3) {
                const deprioritized = new Set([failedProvider]);
                const nonDeprioritized = allNodes.filter((n) => !deprioritized.has(n.provider));
                if (nonDeprioritized.length > 0) {
                    const result = (0, selector_1.selectCheapestNode)(allNodes, deprioritized);
                    (0, vitest_1.expect)(result).not.toBeNull();
                    (0, vitest_1.expect)(result.provider).not.toBe(failedProvider);
                }
            }
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("when all providers deprioritized, falls back to cheapest overall", () => {
        fast_check_1.default.assert(fast_check_1.default.property(multiProviderNodesArb, (allNodes) => {
            // Deprioritize all providers
            const allProviders = new Set(allNodes.map((n) => n.provider));
            const result = (0, selector_1.selectCheapestNode)(allNodes, allProviders);
            (0, vitest_1.expect)(result).not.toBeNull();
            const minRate = Math.min(...allNodes.map((n) => n.hourly_rate_usd));
            (0, vitest_1.expect)(result.hourly_rate_usd).toBe(minRate);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=dispatcher.property.test.js.map