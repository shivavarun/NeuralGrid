/**
 * Provider-kill chaos-test gate (CI_Pipeline, Req 25).
 *
 * Kills a provider while a Job is Running and, within 60s of the kill, must
 * observe all three recovery outcomes together:
 *   1. the Circuit_Breaker opening for the killed provider (Req 25.1),
 *   2. the Job_Scheduler failing the Job over to a *different* provider, and
 *   3. the Billing_Service issuing a refund for the killed Job.
 *
 * The gate blocks deployment (Req 25.2) if any of the three is missing, blocks
 * (Req 25.3) if the refund does not equal the cost accrued by the Job at the
 * moment of the kill, and blocks (Req 25.4) if the whole run does not complete
 * within 120s of starting.
 *
 * This exercises the already-shipped mechanisms together rather than
 * re-implementing them: the Circuit_Breaker pure decision logic
 * (`circuitBreaker.ts`), node-selection failover (`failover.ts`), and the
 * synchronous auto-refund (`autoRefund.ts` in api-gateway). All time is driven
 * by an injected clock and all I/O by injected fakes, so the run is fully
 * deterministic — no real Redis, provider, or ledger.
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4
 */

import type { BillingEvent, Provider, ProviderNode } from "@neuralgrid/shared";
import {
  DEFAULT_BREAKER_CONFIG,
  applyAutoClose,
  recordFailurePure,
  type BreakerConfig,
  type BreakerOpenAlert,
} from "./circuitBreaker";
import type { CircuitBreakerState } from "@neuralgrid/shared";
import { selectNodeWithFailover } from "./failover";
import {
  autoRefundOnFailure,
  type AutoRefundLedgerStore,
} from "../../api-gateway/src/autoRefund";

// --- Gate bounds (Req 25.1, 25.4) ---

/** All three outcomes must be observed within this window of the kill. */
export const OBSERVATION_WINDOW_MS = 60_000;

/** The whole run must finish within this window of starting. */
export const COMPLETION_BUDGET_MS = 120_000;

// --- Injectable clock ---

/**
 * Monotonic, manually-advanced clock. `nowMs()` feeds the breaker windows and
 * the elapsed/accrual math; `nowIso()` feeds the ledger's `created_at`.
 */
export interface ChaosClock {
  nowMs(): number;
  nowIso(): string;
  advance(ms: number): void;
}

export function makeChaosClock(startMs = 0): ChaosClock {
  let t = startMs;
  return {
    nowMs: () => t,
    nowIso: () => new Date(t).toISOString(),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// --- In-memory append-only ledger (satisfies AutoRefundLedgerStore) ---

export class InMemoryLedger implements AutoRefundLedgerStore {
  private readonly events: BillingEvent[] = [];

  async append(event: BillingEvent): Promise<void> {
    this.events.push(event);
  }

  async listByJob(jobId: string): Promise<BillingEvent[]> {
    return this.events.filter((e) => e.job_id === jobId);
  }

  all(): BillingEvent[] {
    return [...this.events];
  }
}

// --- Fake provider adapter: starts a job Running, then is killed ---

/**
 * A provider whose node can run a job until it is killed. After `kill()`, every
 * dispatch attempt to this provider fails — that is what drives the breaker.
 */
export class FakeProviderAdapter {
  alive = true;

  constructor(
    readonly providerId: string,
    readonly node: ProviderNode
  ) {}

  kill(): void {
    this.alive = false;
  }

  /** A dispatch attempt: succeeds only while the provider is alive. */
  dispatch(): { success: boolean } {
    return { success: this.alive };
  }
}

// --- Gate result ---

export interface ChaosObservations {
  breakerOpened: boolean;
  breakerOpenedAtMs?: number;
  failedOver: boolean;
  failoverProvider?: Provider;
  refunded: boolean;
  refundAmount?: number;
  accruedCostAtKill?: number;
  breakerAlert?: BreakerOpenAlert;
}

export interface ChaosGateResult {
  /** True only when all three outcomes fired, refund matched, and bounds held. */
  pass: boolean;
  /** True when the CI_Pipeline must block deployment (the inverse of `pass`). */
  blockDeployment: boolean;
  /** Human-readable reasons the gate blocked (empty when passing). */
  reasons: string[];
  observations: ChaosObservations;
  /** Wall-clock the run consumed, per the injected clock. */
  elapsedMs: number;
}

// --- Configuration ---

export interface ChaosConfig {
  clock?: ChaosClock;
  breakerConfig?: BreakerConfig;
  /** hourly rate of the primary (killed) provider's node. */
  primaryRateUsd?: number;
  /** ms the Job runs before the provider is killed (drives accrued cost). */
  runtimeBeforeKillMs?: number;
}

/** Round a currency amount to 2 dp, matching the ledger convention. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Accrued cost = hourly_rate x (elapsed_ms / 3_600_000), to 2 dp. */
export function accruedCost(hourlyRateUsd: number, elapsedMs: number): number {
  return round2(hourlyRateUsd * (elapsedMs / 3_600_000));
}

/**
 * Run the deterministic provider-kill chaos scenario and return the gate result.
 *
 * Timeline (all via the injected clock):
 *   t0                      start; dispatch Job to primary provider -> Running
 *   t0 + runtimeBeforeKill   kill primary; snapshot accrued cost; record charge
 *   ...within 60s of kill    3 failed redispatch attempts -> breaker opens;
 *                            failover selects a different provider;
 *                            auto-refund credits the accrued cost.
 */
export async function runProviderKillChaos(
  config: ChaosConfig = {}
): Promise<ChaosGateResult> {
  const clock = config.clock ?? makeChaosClock(1_000_000);
  const breakerConfig = config.breakerConfig ?? DEFAULT_BREAKER_CONFIG;
  const primaryRate = config.primaryRateUsd ?? 2.4;
  const runtimeBeforeKillMs = config.runtimeBeforeKillMs ?? 30_000;

  const jobId = "chaos-job-1";
  const userId = "chaos-user-1";

  // Two providers: the primary we will kill, and a healthy backup for failover.
  const primaryNode: ProviderNode = {
    provider: "vastai",
    node_id: "vastai-primary",
    gpu_model: "A100",
    vram_gb: 80,
    hourly_rate_usd: primaryRate,
    availability: true,
  };
  const backupNode: ProviderNode = {
    provider: "runpod",
    node_id: "runpod-backup",
    gpu_model: "A100",
    vram_gb: 80,
    hourly_rate_usd: primaryRate + 0.5,
    availability: true,
  };
  const allNodes = [primaryNode, backupNode];

  const primary = new FakeProviderAdapter(primaryNode.provider, primaryNode);

  const ledger = new InMemoryLedger();

  const observations: ChaosObservations = {
    breakerOpened: false,
    failedOver: false,
    refunded: false,
  };

  const startMs = clock.nowMs();

  // --- t0: dispatch to primary; the Job is Running. ---
  const running = primary.dispatch();
  if (!running.success) {
    return blocked(observations, startMs, clock, [
      "Job never reached Running on the primary provider",
    ]);
  }

  // --- Job runs, accruing cost, until the provider is killed. ---
  clock.advance(runtimeBeforeKillMs);
  const killMs = clock.nowMs();
  const accrued = accruedCost(primaryNode.hourly_rate_usd, runtimeBeforeKillMs);
  observations.accruedCostAtKill = accrued;
  primary.kill();

  // The charge accrued by the Job up to the kill (stored negative).
  await ledger.append({
    id: "charge-chaos-1",
    user_id: userId,
    job_id: jobId,
    type: "charge",
    amount_usd: -accrued,
    created_at: clock.nowIso(),
  });

  // --- Feed failed redispatch attempts into the Circuit_Breaker. ---
  // Each retry to the (now dead) primary fails; the breaker opens at the
  // threshold within its rolling window. All attempts happen inside the 60s
  // observation window via small clock advances.
  let breakerState: CircuitBreakerState = {
    provider_id: primary.providerId,
    failure_timestamps: [],
    state: "closed",
  };
  for (let i = 0; i < breakerConfig.threshold; i++) {
    clock.advance(1_000);
    const attempt = primary.dispatch();
    if (attempt.success) continue; // (never, once killed)
    const transition = recordFailurePure(
      breakerState,
      clock.nowMs(),
      breakerConfig
    );
    breakerState = transition.state;
    if (transition.opened && !observations.breakerOpened) {
      observations.breakerOpened = true;
      observations.breakerOpenedAtMs = clock.nowMs();
      observations.breakerAlert = {
        kind: "breaker_open",
        provider_id: primary.providerId,
        opened_at: clock.nowMs(),
      };
    }
  }

  // --- Failover: exclude the open provider, select a different one. ---
  const openProviders = new Set<string>();
  if (
    applyAutoClose(breakerState, clock.nowMs(), breakerConfig.cooldownMs)
      .state === "open"
  ) {
    openProviders.add(primary.providerId);
  }
  const failover = selectNodeWithFailover(allNodes, openProviders);
  if ("node" in failover && failover.node.provider !== primaryNode.provider) {
    observations.failedOver = true;
    observations.failoverProvider = failover.node.provider;
  }

  // --- Auto-refund the killed Job (synchronous, before completion). ---
  const refund = await autoRefundOnFailure(jobId, {
    store: ledger,
    updateJobStatus: async () => {},
    now: () => clock.nowIso(),
  });
  if (refund.status === "refunded") {
    const credit = ledger
      .all()
      .filter((e) => e.job_id === jobId && e.type === "credit")
      .reduce((sum, e) => sum + e.amount_usd, 0);
    observations.refunded = true;
    observations.refundAmount = round2(credit);
  }

  const endMs = clock.nowMs();
  const elapsedMs = endMs - startMs;

  // --- Gate evaluation (Req 25.2, 25.3, 25.4). ---
  const reasons: string[] = [];

  const withinObservationWindow =
    endMs - killMs <= OBSERVATION_WINDOW_MS;

  if (!observations.breakerOpened) {
    reasons.push("Circuit_Breaker did not open for the killed provider");
  }
  if (!observations.failedOver) {
    reasons.push("Job did not fail over to a different provider");
  }
  if (!observations.refunded) {
    reasons.push("no refund was issued for the killed Job");
  }
  if (!withinObservationWindow) {
    reasons.push(
      `recovery outcomes not all observed within ${OBSERVATION_WINDOW_MS}ms of the kill`
    );
  }
  if (
    observations.refunded &&
    observations.refundAmount !== observations.accruedCostAtKill
  ) {
    reasons.push(
      `refund ${observations.refundAmount} != accrued cost at kill ${observations.accruedCostAtKill}`
    );
  }
  if (elapsedMs > COMPLETION_BUDGET_MS) {
    reasons.push(
      `chaos test did not complete within ${COMPLETION_BUDGET_MS}ms (took ${elapsedMs}ms)`
    );
  }

  const pass = reasons.length === 0;
  return { pass, blockDeployment: !pass, reasons, observations, elapsedMs };
}

function blocked(
  observations: ChaosObservations,
  startMs: number,
  clock: ChaosClock,
  reasons: string[]
): ChaosGateResult {
  return {
    pass: false,
    blockDeployment: true,
    reasons,
    observations,
    elapsedMs: clock.nowMs() - startMs,
  };
}
