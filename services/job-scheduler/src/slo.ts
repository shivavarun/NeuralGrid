/**
 * Job_Scheduler SLO wiring (Req 21.2, 21.3).
 *
 * Uses the shared SloTracker to record submission→dispatch latency (P50 target
 * < 800 ms) and terminal job outcomes (success-rate target ≥ 90%). A single
 * process-wide instance is shared across the dispatch path.
 */

import { SloTracker } from "@neuralgrid/shared";

/** Process-wide SLO tracker for the Job_Scheduler. */
export const sloTracker = new SloTracker();

/** Dispatch latency (ms) between submission and dispatch, clamped at >= 0. */
export function dispatchLatencyMs(submittedAt: number, dispatchedAt: number): number {
  return Math.max(0, dispatchedAt - submittedAt);
}
