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
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeBillingMetrics = computeBillingMetrics;
/**
 * Property 19: Billing Period Spend Calculation
 * Feature: neuralgrid-mvp, Property 19: Billing Period Spend Calculation
 *
 * Validates: Requirements 11.2, 11.5
 *
 * For any developer, the displayed total spend SHALL equal the sum of actual_cost_usd
 * for all completed jobs in the current billing period. The savings percentage SHALL
 * equal (sum_runpod_equivalent - sum_actual_cost) / sum_runpod_equivalent × 100.
 */
const vitest_1 = require("vitest");
const fc = __importStar(require("fast-check"));
// --- Pure billing metrics function ---
const RUNPOD_A100_HOURLY_RATE = 3.29; // USD/hr — matches dashboard/billing/page.tsx
/**
 * Compute billing metrics for a set of completed jobs in a billing period.
 * - totalSpend: sum of actual_cost_usd for all jobs
 * - runpodEquivalent: sum of (RUNPOD_A100_HOURLY_RATE × runtime_seconds / 3600)
 * - savingsPct: (runpodEquivalent - totalSpend) / runpodEquivalent × 100
 *   Returns 0 when runpodEquivalent is 0 (no runtime).
 */
function computeBillingMetrics(jobs) {
    const totalSpend = jobs.reduce((sum, j) => sum + j.actual_cost_usd, 0);
    const runpodEquivalent = jobs.reduce((sum, j) => sum + RUNPOD_A100_HOURLY_RATE * (j.runtime_seconds / 3600), 0);
    const savingsPct = runpodEquivalent === 0
        ? 0
        : ((runpodEquivalent - totalSpend) / runpodEquivalent) * 100;
    return { totalSpend, runpodEquivalent, savingsPct };
}
// --- Generators ---
const jobArb = fc.record({
    job_id: fc.string({ minLength: 1, maxLength: 30 }),
    actual_cost_usd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
    runtime_seconds: fc.double({ min: 0, max: 360000, noNaN: true, noDefaultInfinity: true }),
});
const jobsArb = fc.array(jobArb, { minLength: 0, maxLength: 50 });
// --- Property tests ---
(0, vitest_1.describe)('Feature: neuralgrid-mvp, Property 19: Billing Period Spend Calculation', () => {
    (0, vitest_1.it)('totalSpend equals sum of actual_cost_usd for all completed jobs', () => {
        fc.assert(fc.property(jobsArb, (jobs) => {
            const metrics = computeBillingMetrics(jobs);
            const expectedTotal = jobs.reduce((s, j) => s + j.actual_cost_usd, 0);
            (0, vitest_1.expect)(metrics.totalSpend).toBeCloseTo(expectedTotal, 10);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('runpodEquivalent equals sum of RUNPOD_A100_RATE × runtime_seconds / 3600', () => {
        fc.assert(fc.property(jobsArb, (jobs) => {
            const metrics = computeBillingMetrics(jobs);
            const expectedRunpod = jobs.reduce((s, j) => s + RUNPOD_A100_HOURLY_RATE * (j.runtime_seconds / 3600), 0);
            (0, vitest_1.expect)(metrics.runpodEquivalent).toBeCloseTo(expectedRunpod, 10);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('savingsPct = (runpodEquivalent - totalSpend) / runpodEquivalent × 100', () => {
        // Use jobs with positive runtime to avoid division by zero case
        const positiveRuntimeJobArb = fc.record({
            job_id: fc.string({ minLength: 1, maxLength: 30 }),
            actual_cost_usd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
            runtime_seconds: fc.double({ min: 0.01, max: 360000, noNaN: true, noDefaultInfinity: true }),
        });
        fc.assert(fc.property(fc.array(positiveRuntimeJobArb, { minLength: 1, maxLength: 50 }), (jobs) => {
            const metrics = computeBillingMetrics(jobs);
            const expectedPct = ((metrics.runpodEquivalent - metrics.totalSpend) / metrics.runpodEquivalent) * 100;
            (0, vitest_1.expect)(metrics.savingsPct).toBeCloseTo(expectedPct, 10);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('savingsPct is 0 when all jobs have zero runtime', () => {
        const zeroRuntimeJobArb = fc.record({
            job_id: fc.string({ minLength: 1, maxLength: 30 }),
            actual_cost_usd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
            runtime_seconds: fc.constant(0),
        });
        fc.assert(fc.property(fc.array(zeroRuntimeJobArb, { minLength: 0, maxLength: 20 }), (jobs) => {
            const metrics = computeBillingMetrics(jobs);
            (0, vitest_1.expect)(metrics.savingsPct).toBe(0);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=billing.property.test.js.map