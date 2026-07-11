/**
 * SLO measurement helpers (Req 21).
 *
 * Pure computation functions plus a lightweight in-memory tracker that
 * services wire into their request/dispatch/outcome paths. Targets:
 *   - API_Gateway availability      ≥ 99.5% non-5xx           (Req 21.1)
 *   - Job_Scheduler P50 dispatch    < 800 ms                  (Req 21.2)
 *   - Job success rate              ≥ 90% COMPLETE / terminal (Req 21.3)
 */

import {
  SLO_AVAILABILITY_TARGET,
  SLO_P50_DISPATCH_LATENCY_MS,
  SLO_JOB_SUCCESS_RATE_TARGET,
} from "./constants";

/** A single SLO measurement compared against its target. */
export interface SloStatus {
  /** Observed value. */
  value: number;
  /** Configured target. */
  target: number;
  /** True when the observed value meets the target. */
  met: boolean;
}

/** Snapshot of all tracked SLOs. */
export interface SloReport {
  availability: SloStatus;
  p50DispatchLatencyMs: SloStatus;
  jobSuccessRate: SloStatus;
}

/** Terminal job outcomes that count toward the success-rate SLO. */
export type SloJobOutcome = "COMPLETE" | "FAILED" | "JOB_TIMEOUT";

// --- Pure computations ---

/** Availability = non-5xx / total. Empty sample is treated as fully available (1). */
export function computeAvailability(non5xxCount: number, totalCount: number): number {
  if (totalCount <= 0) return 1;
  return non5xxCount / totalCount;
}

/** True when an HTTP status code is NOT a 5xx server error. */
export function isNon5xx(statusCode: number): boolean {
  return statusCode < 500 || statusCode >= 600;
}

/**
 * Nearest-rank percentile over a sample. `p` in [0, 100].
 * Empty sample returns 0.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const idx = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[idx];
}

/** P50 (median by nearest-rank) of dispatch latencies. */
export function computeP50(latenciesMs: number[]): number {
  return percentile(latenciesMs, 50);
}

/** Success rate = completed / terminal. Empty sample is treated as fully successful (1). */
export function computeSuccessRate(completedCount: number, terminalCount: number): number {
  if (terminalCount <= 0) return 1;
  return completedCount / terminalCount;
}

// --- Target evaluation ---

export function evaluateAvailabilitySlo(non5xxCount: number, totalCount: number): SloStatus {
  const value = computeAvailability(non5xxCount, totalCount);
  return { value, target: SLO_AVAILABILITY_TARGET, met: value >= SLO_AVAILABILITY_TARGET };
}

export function evaluateP50DispatchSlo(latenciesMs: number[]): SloStatus {
  const value = computeP50(latenciesMs);
  return {
    value,
    target: SLO_P50_DISPATCH_LATENCY_MS,
    met: value < SLO_P50_DISPATCH_LATENCY_MS,
  };
}

export function evaluateJobSuccessRateSlo(completedCount: number, terminalCount: number): SloStatus {
  const value = computeSuccessRate(completedCount, terminalCount);
  return {
    value,
    target: SLO_JOB_SUCCESS_RATE_TARGET,
    met: value >= SLO_JOB_SUCCESS_RATE_TARGET,
  };
}

// --- Stateful tracker ---

/**
 * Minimal self-contained SLO tracker. Services record raw events; `report()`
 * evaluates the current sample against each target. Reset per measurement
 * window as needed.
 */
export class SloTracker {
  private non5xx = 0;
  private totalResponses = 0;
  private dispatchLatencies: number[] = [];
  private completed = 0;
  private terminal = 0;

  /** Record an HTTP response for the availability SLO. */
  recordResponse(statusCode: number): void {
    this.totalResponses++;
    if (isNon5xx(statusCode)) this.non5xx++;
  }

  /** Record a submission→dispatch latency (ms) for the P50 SLO. Negatives ignored. */
  recordDispatchLatency(latencyMs: number): void {
    if (Number.isFinite(latencyMs) && latencyMs >= 0) {
      this.dispatchLatencies.push(latencyMs);
    }
  }

  /** Record a terminal job outcome for the success-rate SLO. */
  recordJobOutcome(outcome: SloJobOutcome): void {
    this.terminal++;
    if (outcome === "COMPLETE") this.completed++;
  }

  /** Evaluate all tracked SLOs against their targets. */
  report(): SloReport {
    return {
      availability: evaluateAvailabilitySlo(this.non5xx, this.totalResponses),
      p50DispatchLatencyMs: evaluateP50DispatchSlo(this.dispatchLatencies),
      jobSuccessRate: evaluateJobSuccessRateSlo(this.completed, this.terminal),
    };
  }

  /** Clear all recorded samples (e.g. at the start of a new measurement window). */
  reset(): void {
    this.non5xx = 0;
    this.totalResponses = 0;
    this.dispatchLatencies = [];
    this.completed = 0;
    this.terminal = 0;
  }
}
