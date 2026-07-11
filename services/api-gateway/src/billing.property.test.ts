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
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// --- Pure billing metrics function ---

const RUNPOD_A100_HOURLY_RATE = 3.29; // USD/hr — matches dashboard/billing/page.tsx

export interface CompletedJob {
  job_id: string;
  actual_cost_usd: number;
  runtime_seconds: number;
}

export interface BillingMetrics {
  totalSpend: number;
  runpodEquivalent: number;
  savingsPct: number;
}

/**
 * Compute billing metrics for a set of completed jobs in a billing period.
 * - totalSpend: sum of actual_cost_usd for all jobs
 * - runpodEquivalent: sum of (RUNPOD_A100_HOURLY_RATE × runtime_seconds / 3600)
 * - savingsPct: (runpodEquivalent - totalSpend) / runpodEquivalent × 100
 *   Returns 0 when runpodEquivalent is 0 (no runtime).
 */
export function computeBillingMetrics(jobs: CompletedJob[]): BillingMetrics {
  const totalSpend = jobs.reduce((sum, j) => sum + j.actual_cost_usd, 0);
  const runpodEquivalent = jobs.reduce(
    (sum, j) => sum + RUNPOD_A100_HOURLY_RATE * (j.runtime_seconds / 3600),
    0
  );
  const savingsPct =
    runpodEquivalent === 0
      ? 0
      : ((runpodEquivalent - totalSpend) / runpodEquivalent) * 100;

  return { totalSpend, runpodEquivalent, savingsPct };
}

// --- Generators ---

const jobArb: fc.Arbitrary<CompletedJob> = fc.record({
  job_id: fc.string({ minLength: 1, maxLength: 30 }),
  actual_cost_usd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  runtime_seconds: fc.double({ min: 0, max: 360000, noNaN: true, noDefaultInfinity: true }),
});

const jobsArb = fc.array(jobArb, { minLength: 0, maxLength: 50 });

// --- Property tests ---

describe('Feature: neuralgrid-mvp, Property 19: Billing Period Spend Calculation', () => {
  it('totalSpend equals sum of actual_cost_usd for all completed jobs', () => {
    fc.assert(
      fc.property(jobsArb, (jobs) => {
        const metrics = computeBillingMetrics(jobs);
        const expectedTotal = jobs.reduce((s, j) => s + j.actual_cost_usd, 0);
        expect(metrics.totalSpend).toBeCloseTo(expectedTotal, 10);
      }),
      { numRuns: 100 }
    );
  });

  it('runpodEquivalent equals sum of RUNPOD_A100_RATE × runtime_seconds / 3600', () => {
    fc.assert(
      fc.property(jobsArb, (jobs) => {
        const metrics = computeBillingMetrics(jobs);
        const expectedRunpod = jobs.reduce(
          (s, j) => s + RUNPOD_A100_HOURLY_RATE * (j.runtime_seconds / 3600),
          0
        );
        expect(metrics.runpodEquivalent).toBeCloseTo(expectedRunpod, 10);
      }),
      { numRuns: 100 }
    );
  });

  it('savingsPct = (runpodEquivalent - totalSpend) / runpodEquivalent × 100', () => {
    // Use jobs with positive runtime to avoid division by zero case
    const positiveRuntimeJobArb = fc.record({
      job_id: fc.string({ minLength: 1, maxLength: 30 }),
      actual_cost_usd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
      runtime_seconds: fc.double({ min: 0.01, max: 360000, noNaN: true, noDefaultInfinity: true }),
    });

    fc.assert(
      fc.property(fc.array(positiveRuntimeJobArb, { minLength: 1, maxLength: 50 }), (jobs) => {
        const metrics = computeBillingMetrics(jobs);
        const expectedPct =
          ((metrics.runpodEquivalent - metrics.totalSpend) / metrics.runpodEquivalent) * 100;
        expect(metrics.savingsPct).toBeCloseTo(expectedPct, 10);
      }),
      { numRuns: 100 }
    );
  });

  it('savingsPct is 0 when all jobs have zero runtime', () => {
    const zeroRuntimeJobArb = fc.record({
      job_id: fc.string({ minLength: 1, maxLength: 30 }),
      actual_cost_usd: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
      runtime_seconds: fc.constant(0),
    });

    fc.assert(
      fc.property(fc.array(zeroRuntimeJobArb, { minLength: 0, maxLength: 20 }), (jobs) => {
        const metrics = computeBillingMetrics(jobs);
        expect(metrics.savingsPct).toBe(0);
      }),
      { numRuns: 100 }
    );
  });
});
