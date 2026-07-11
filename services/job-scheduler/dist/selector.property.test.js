"use strict";
/**
 * Property 4: Cheapest Node Selection
 * For any non-empty set of available nodes at a tier, verify the selected node
 * has the minimum hourly_rate_usd.
 *
 * **Validates: Requirements 8.1**
 *
 * Feature: neuralgrid-mvp, Property 4: Cheapest Node Selection
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const selector_1 = require("./selector");
const providerArb = fast_check_1.default.constantFrom("vastai", "runpod");
const providerNodeArb = fast_check_1.default.record({
    provider: providerArb,
    node_id: fast_check_1.default.string({ minLength: 1, maxLength: 20 }),
    gpu_model: fast_check_1.default.constantFrom("A100", "H100", "RTX4090", "RTX3090", "A6000"),
    vram_gb: fast_check_1.default.integer({ min: 4, max: 80 }),
    hourly_rate_usd: fast_check_1.default.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
    availability: fast_check_1.default.boolean(),
});
const nonEmptyNodesArb = fast_check_1.default.array(providerNodeArb, { minLength: 1, maxLength: 50 });
(0, vitest_1.describe)("Property 4: Cheapest Node Selection", () => {
    (0, vitest_1.it)("selected node has minimum hourly_rate_usd among non-deprioritized nodes", () => {
        fast_check_1.default.assert(fast_check_1.default.property(nonEmptyNodesArb, (nodes) => {
            const result = (0, selector_1.selectCheapestNode)(nodes);
            // selectCheapestNode picks cheapest from all nodes when no deprioritization
            (0, vitest_1.expect)(result).not.toBeNull();
            const minRate = Math.min(...nodes.map((n) => n.hourly_rate_usd));
            (0, vitest_1.expect)(result.hourly_rate_usd).toBe(minRate);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("selected node has minimum hourly_rate_usd among non-deprioritized providers", () => {
        fast_check_1.default.assert(fast_check_1.default.property(nonEmptyNodesArb, fast_check_1.default.subarray(["vastai", "runpod"], { minLength: 1, maxLength: 1 }), (nodes, deprioritizedArr) => {
            const deprioritized = new Set(deprioritizedArr);
            const result = (0, selector_1.selectCheapestNode)(nodes, deprioritized);
            (0, vitest_1.expect)(result).not.toBeNull();
            const nonDeprioritized = nodes.filter((n) => !deprioritized.has(n.provider));
            if (nonDeprioritized.length > 0) {
                // Should pick cheapest from non-deprioritized
                const minRate = Math.min(...nonDeprioritized.map((n) => n.hourly_rate_usd));
                (0, vitest_1.expect)(result.hourly_rate_usd).toBe(minRate);
            }
            else {
                // Fallback: all deprioritized, pick cheapest overall
                const minRate = Math.min(...nodes.map((n) => n.hourly_rate_usd));
                (0, vitest_1.expect)(result.hourly_rate_usd).toBe(minRate);
            }
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("when all providers deprioritized, still picks cheapest overall (fallback)", () => {
        fast_check_1.default.assert(fast_check_1.default.property(nonEmptyNodesArb, (nodes) => {
            // Deprioritize all providers
            const allProviders = new Set(nodes.map((n) => n.provider));
            const result = (0, selector_1.selectCheapestNode)(nodes, allProviders);
            (0, vitest_1.expect)(result).not.toBeNull();
            const minRate = Math.min(...nodes.map((n) => n.hourly_rate_usd));
            (0, vitest_1.expect)(result.hourly_rate_usd).toBe(minRate);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=selector.property.test.js.map