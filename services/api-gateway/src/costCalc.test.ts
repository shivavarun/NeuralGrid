/**
 * Unit tests for the cost calculation module (Req 22.3).
 *
 * Covers: neuralgrid_margin application, RunPod A100 baseline comparison
 * (absolute savings + savings percentage), and the zero/negative-savings case.
 */

import { describe, it, expect } from "vitest";
import {
  applyMargin,
  computeBaselineComparison,
  calculateJobCost,
  roundUsd,
  NEURALGRID_MARGIN_PCT,
  RUNPOD_A100_RATE_PER_HOUR,
} from "./costCalc";

describe("roundUsd", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundUsd(1.006)).toBe(1.01);
    expect(roundUsd(1.004)).toBe(1.0);
    expect(roundUsd(2.345)).toBe(2.35);
    expect(roundUsd(0)).toBe(0);
  });
});

describe("applyMargin", () => {
  it("applies the default 20% margin", () => {
    const r = applyMargin(1.0);
    expect(NEURALGRID_MARGIN_PCT).toBe(20);
    expect(r.provider_cost_usd).toBe(1.0);
    expect(r.margin_usd).toBe(0.2);
    expect(r.customer_cost_usd).toBe(1.2);
  });

  it("provider cost + margin equals customer cost", () => {
    const r = applyMargin(2.5);
    expect(roundUsd(r.provider_cost_usd + r.margin_usd)).toBe(r.customer_cost_usd);
  });

  it("supports a custom margin percentage", () => {
    const r = applyMargin(10, 50);
    expect(r.margin_usd).toBe(5);
    expect(r.customer_cost_usd).toBe(15);
  });

  it("handles a zero base cost", () => {
    const r = applyMargin(0);
    expect(r.provider_cost_usd).toBe(0);
    expect(r.margin_usd).toBe(0);
    expect(r.customer_cost_usd).toBe(0);
  });
});

describe("computeBaselineComparison", () => {
  it("computes RunPod cost, absolute savings, and percentage for a cheaper job", () => {
    // 1 hour of runtime => runpod cost = 3.09. Customer pays 1.20.
    const r = computeBaselineComparison(1.2, 3600);
    expect(r.runpod_cost_usd).toBe(RUNPOD_A100_RATE_PER_HOUR);
    expect(r.absolute_savings_usd).toBe(roundUsd(3.09 - 1.2));
    expect(r.saving_pct).toBeCloseTo(((3.09 - 1.2) / 3.09) * 100, 2);
    expect(r.saving_pct).toBeGreaterThan(0);
  });

  it("reports zero savings when customer cost equals the baseline", () => {
    const r = computeBaselineComparison(3.09, 3600);
    expect(r.absolute_savings_usd).toBe(0);
    expect(r.saving_pct).toBe(0);
  });

  it("reports negative savings when the customer cost exceeds the baseline", () => {
    // Customer charged 5.00 for a 1-hour job; RunPod baseline is 3.09.
    const r = computeBaselineComparison(5.0, 3600);
    expect(r.absolute_savings_usd).toBeLessThan(0);
    expect(r.absolute_savings_usd).toBe(roundUsd(3.09 - 5.0));
    expect(r.saving_pct).toBeLessThan(0);
  });

  it("returns zero percentage when the baseline cost is zero", () => {
    const r = computeBaselineComparison(1.0, 0);
    expect(r.runpod_cost_usd).toBe(0);
    expect(r.saving_pct).toBe(0);
    expect(r.absolute_savings_usd).toBe(roundUsd(0 - 1.0));
  });

  it("supports a custom RunPod rate", () => {
    const r = computeBaselineComparison(1.0, 3600, 4.0);
    expect(r.runpod_cost_usd).toBe(4.0);
    expect(r.absolute_savings_usd).toBe(3.0);
  });
});

describe("calculateJobCost", () => {
  it("combines margin and baseline into one result", () => {
    const r = calculateJobCost(1.0, 3600);
    expect(r.provider_cost_usd).toBe(1.0);
    expect(r.margin_usd).toBe(0.2);
    expect(r.customer_cost_usd).toBe(1.2);
    expect(r.baseline.runpod_cost_usd).toBe(3.09);
    expect(r.baseline.saving_pct).toBeGreaterThan(0);
  });

  it("surfaces negative savings for an expensive job", () => {
    // High base cost so customer cost exceeds the RunPod baseline.
    const r = calculateJobCost(4.0, 3600);
    expect(r.customer_cost_usd).toBe(4.8);
    expect(r.baseline.absolute_savings_usd).toBeLessThan(0);
    expect(r.baseline.saving_pct).toBeLessThan(0);
  });

  it("honors custom margin and RunPod rate options", () => {
    const r = calculateJobCost(2.0, 1800, { marginPct: 10, runpodRatePerHour: 6.0 });
    expect(r.customer_cost_usd).toBe(2.2);
    // 0.5h * 6.0 = 3.0 baseline
    expect(r.baseline.runpod_cost_usd).toBe(3.0);
    expect(r.baseline.absolute_savings_usd).toBe(0.8);
  });
});
