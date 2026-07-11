/**
 * Job_Timeout computation and monitor.
 *
 * At dispatch a job's timeout is computed as `estimated_runtime_ms * 3`, anchored
 * to the dispatch timestamp. A monitor sweeps non-terminal dispatched jobs and,
 * once a job's timeout has elapsed, marks it FAILED / JOB_TIMEOUT and records an
 * Estimator_Miss_Record (cause TIMEOUT) in the estimator_registry. A provider
 * result delivered for a job that has already gone terminal (e.g. FAILED via
 * JOB_TIMEOUT) is discarded and never changes the job's status.
 *
 * Following the softQueue.ts / circuitBreaker.ts convention, the pure decision
 * logic (timeout computation, elapsed check, terminal-result guard) is separated
 * from the side-effecting collaborators, which are injected so the monitor is
 * testable without a real Job_Store or estimator_registry.
 *
 * Requirements: 4.1, 4.2, 4.5, 4.6
 */

import { ErrorCode } from "@neuralgrid/shared";
import type { JobTimeout } from "@neuralgrid/shared";

// --- Configuration ---

/** Job_Timeout is the estimated runtime multiplied by this factor (Req 4.1). */
export const JOB_TIMEOUT_MULTIPLIER = 3;

/** Default cadence for the timeout-monitor sweep. */
export const JOB_TIMEOUT_MONITOR_INTERVAL_MS = 5_000;

/** Job statuses that are terminal — a late result for these is discarded. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "COMPLETE",
  "FAILED",
]);

// --- Estimator_Miss_Record (persists to estimator_registry, migration 002) ---

export type EstimatorMissCause = "TIMEOUT" | "OOM";

export interface EstimatorMissRecord {
  job_id: string;
  job_type: string;
  cause: EstimatorMissCause;
}

// --- Pure logic (no I/O; unit/property testable) ---

/**
 * Compute a job's Job_Timeout at dispatch: `estimated_runtime_ms * 3`, anchored
 * to the dispatch timestamp (Req 4.1).
 */
export function computeJobTimeout(
  jobId: string,
  estimatedRuntimeMs: number,
  dispatchedAt: number
): JobTimeout {
  return {
    job_id: jobId,
    dispatched_at: dispatchedAt,
    timeout_ms: estimatedRuntimeMs * JOB_TIMEOUT_MULTIPLIER,
  };
}

/**
 * True once a dispatched job's Job_Timeout has elapsed, measured from its
 * dispatch timestamp (Req 4.2).
 */
export function isTimedOut(timeout: JobTimeout, now: number): boolean {
  return now - timeout.dispatched_at >= timeout.timeout_ms;
}

/** Whether a status is terminal (case-insensitive). */
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toUpperCase());
}

/**
 * Terminal guard for late provider results (Req 4.6). A result delivered for a
 * job that has already reached a terminal status (e.g. FAILED via JOB_TIMEOUT)
 * must be discarded so the job's status is never changed away from FAILED.
 */
export function shouldDiscardLateResult(currentStatus: string): boolean {
  return isTerminalStatus(currentStatus);
}

// --- Orchestration ---

/**
 * Side-effecting collaborators, injected so the monitor stays testable without a
 * real Job_Store or estimator_registry.
 */
export interface JobTimeoutDeps {
  /** Current time in ms epoch (injectable clock). */
  now(): number;
  /**
   * Load the Job_Timeout records for every currently non-terminal dispatched
   * job, each paired with the job's `job_type` for the Estimator_Miss_Record.
   */
  loadActiveTimeouts(): Promise<Array<{ timeout: JobTimeout; job_type: string }>>;
  /** Current status of a job, or null if unknown (for the late-result guard). */
  getJobStatus(jobId: string): Promise<string | null>;
  /** Mark a job FAILED with a terminal error_code (Req 4.2). */
  markFailed(jobId: string, errorCode: ErrorCode): Promise<void>;
  /** Persist an Estimator_Miss_Record to estimator_registry (Req 4.5). */
  recordEstimatorMiss(record: EstimatorMissRecord): Promise<void>;
  /**
   * Post-charge failure hook (Req 4.3, 4.4). Invoked after a job is failed by
   * timeout so the Billing_Service can synchronously refund a charged job; it is
   * a no-op for an uncharged job. Satisfied by the api-gateway auto-refund
   * handler (`createAutoRefundHandler`). Optional so a scheduler without billing
   * wiring is unaffected.
   */
  onPostChargeFailure?(jobId: string): Promise<unknown>;
}

export class JobTimeoutMonitor {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: JobTimeoutDeps) {}

  /**
   * One monitor sweep (Req 4.2, 4.5): fail every non-terminal dispatched job
   * whose Job_Timeout has elapsed and record its TIMEOUT Estimator_Miss.
   */
  async processOnce(): Promise<void> {
    const now = this.deps.now();
    const active = await this.deps.loadActiveTimeouts();
    for (const { timeout, job_type } of active) {
      if (!isTimedOut(timeout, now)) continue;
      await this.failTimedOut(timeout.job_id, job_type);
    }
  }

  private async failTimedOut(jobId: string, jobType: string): Promise<void> {
    await this.deps.markFailed(jobId, ErrorCode.JOB_TIMEOUT);
    await this.deps.recordEstimatorMiss({
      job_id: jobId,
      job_type: jobType,
      cause: "TIMEOUT",
    });
    // Synchronously refund iff the job was charged (Req 4.3, 4.4).
    if (this.deps.onPostChargeFailure) {
      await this.deps.onPostChargeFailure(jobId);
    }
  }

  /**
   * Handle a provider result for a job. If the job has already gone terminal
   * (e.g. timed out), the result is discarded and the status is left unchanged
   * (Req 4.6). Returns true when the result was accepted for further processing,
   * false when it was discarded as a late result.
   */
  async handleProviderResult(jobId: string): Promise<boolean> {
    const status = await this.deps.getJobStatus(jobId);
    if (status !== null && shouldDiscardLateResult(status)) {
      return false;
    }
    return true;
  }

  /** Begin the monitor sweep loop. Idempotent. */
  start(intervalMs: number = JOB_TIMEOUT_MONITOR_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processOnce();
    }, intervalMs);
  }

  /** Stop the monitor sweep loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
