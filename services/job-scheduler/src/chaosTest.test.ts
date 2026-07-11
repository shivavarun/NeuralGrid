/**
 * Provider-kill chaos-test gate (Req 25).
 *
 * Deterministic exercise of the shipped recovery mechanisms together:
 * Circuit_Breaker open + failover to a different provider + full auto-refund,
 * all within the 60s observation window and the 120s completion budget, driven
 * by an injected clock and in-memory fakes.
 */

import { describe, it, expect } from "vitest";
import {
  runProviderKillChaos,
  makeChaosClock,
  accruedCost,
  OBSERVATION_WINDOW_MS,
  COMPLETION_BUDGET_MS,
} from "./chaosTest";
import { DEFAULT_BREAKER_CONFIG } from "./circuitBreaker";

describe("provider-kill chaos gate (Req 25)", () => {
  it("passes when breaker opens, job fails over, and refund equals accrued cost", async () => {
    const result = await runProviderKillChaos({
      clock: makeChaosClock(1_000_000),
      primaryRateUsd: 2.4,
      runtimeBeforeKillMs: 30_000,
    });

    // All three recovery outcomes observed (Req 25.1).
    expect(result.observations.breakerOpened).toBe(true);
    expect(result.observations.failedOver).toBe(true);
    expect(result.observations.refunded).toBe(true);

    // Failover went to a *different* provider than the killed one.
    expect(result.observations.failoverProvider).toBe("runpod");

    // Refund equals the cost accrued at the moment of the kill (Req 25.3).
    const expectedAccrued = accruedCost(2.4, 30_000); // 2.4 * (30s/3600s) = 0.02
    expect(result.observations.accruedCostAtKill).toBe(expectedAccrued);
    expect(result.observations.refundAmount).toBe(expectedAccrued);

    // Gate passes -> deployment not blocked.
    expect(result.pass).toBe(true);
    expect(result.blockDeployment).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("fires the breaker-open alert identifying the killed provider", async () => {
    const result = await runProviderKillChaos();
    expect(result.observations.breakerAlert).toBeDefined();
    expect(result.observations.breakerAlert?.kind).toBe("breaker_open");
    expect(result.observations.breakerAlert?.provider_id).toBe("vastai");
  });

  it("completes within the 60s observation and 120s completion bounds", async () => {
    const result = await runProviderKillChaos({
      clock: makeChaosClock(0),
      runtimeBeforeKillMs: 30_000,
    });

    // Breaker opened after the kill, within the observation window.
    expect(result.observations.breakerOpenedAtMs).toBeGreaterThan(30_000);
    expect(result.observations.breakerOpenedAtMs! - 30_000).toBeLessThanOrEqual(
      OBSERVATION_WINDOW_MS
    );

    // Whole run fit the completion budget (Req 25.4).
    expect(result.elapsedMs).toBeLessThanOrEqual(COMPLETION_BUDGET_MS);
  });

  it("refund exactly equals accrued cost across runtimes (Req 25.3)", async () => {
    const result = await runProviderKillChaos({
      primaryRateUsd: 1.8,
      runtimeBeforeKillMs: 45_000,
    });
    const expected = accruedCost(1.8, 45_000); // 1.8 * (45s/3600s) = 0.02 (2 dp)
    expect(result.observations.accruedCostAtKill).toBe(expected);
    expect(result.observations.refundAmount).toBe(expected);
    expect(result.pass).toBe(true);
  });

  it("blocks deployment when the run exceeds the 120s completion budget (Req 25.4)", async () => {
    // A kill that only happens after >120s means the chaos test itself ran too
    // long; the gate must treat that as a failure and block deployment.
    const result = await runProviderKillChaos({
      runtimeBeforeKillMs: COMPLETION_BUDGET_MS + 1,
    });
    expect(result.pass).toBe(false);
    expect(result.blockDeployment).toBe(true);
    expect(result.reasons.some((r) => r.includes("did not complete"))).toBe(
      true
    );
  });

  it("uses the configured breaker threshold to open (3 failures/60s)", async () => {
    const result = await runProviderKillChaos();
    // Default threshold is 3; breaker must have opened.
    expect(DEFAULT_BREAKER_CONFIG.threshold).toBe(3);
    expect(result.observations.breakerOpened).toBe(true);
  });
});
