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
/** Job_Timeout is the estimated runtime multiplied by this factor (Req 4.1). */
export declare const JOB_TIMEOUT_MULTIPLIER = 3;
/** Default cadence for the timeout-monitor sweep. */
export declare const JOB_TIMEOUT_MONITOR_INTERVAL_MS = 5000;
/** Job statuses that are terminal — a late result for these is discarded. */
export declare const TERMINAL_STATUSES: ReadonlySet<string>;
export type EstimatorMissCause = "TIMEOUT" | "OOM";
export interface EstimatorMissRecord {
    job_id: string;
    job_type: string;
    cause: EstimatorMissCause;
}
/**
 * Compute a job's Job_Timeout at dispatch: `estimated_runtime_ms * 3`, anchored
 * to the dispatch timestamp (Req 4.1).
 */
export declare function computeJobTimeout(jobId: string, estimatedRuntimeMs: number, dispatchedAt: number): JobTimeout;
/**
 * True once a dispatched job's Job_Timeout has elapsed, measured from its
 * dispatch timestamp (Req 4.2).
 */
export declare function isTimedOut(timeout: JobTimeout, now: number): boolean;
/** Whether a status is terminal (case-insensitive). */
export declare function isTerminalStatus(status: string): boolean;
/**
 * Terminal guard for late provider results (Req 4.6). A result delivered for a
 * job that has already reached a terminal status (e.g. FAILED via JOB_TIMEOUT)
 * must be discarded so the job's status is never changed away from FAILED.
 */
export declare function shouldDiscardLateResult(currentStatus: string): boolean;
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
    loadActiveTimeouts(): Promise<Array<{
        timeout: JobTimeout;
        job_type: string;
    }>>;
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
export declare class JobTimeoutMonitor {
    private readonly deps;
    private timer;
    constructor(deps: JobTimeoutDeps);
    /**
     * One monitor sweep (Req 4.2, 4.5): fail every non-terminal dispatched job
     * whose Job_Timeout has elapsed and record its TIMEOUT Estimator_Miss.
     */
    processOnce(): Promise<void>;
    private failTimedOut;
    /**
     * Handle a provider result for a job. If the job has already gone terminal
     * (e.g. timed out), the result is discarded and the status is left unchanged
     * (Req 4.6). Returns true when the result was accepted for further processing,
     * false when it was discarded as a late result.
     */
    handleProviderResult(jobId: string): Promise<boolean>;
    /** Begin the monitor sweep loop. Idempotent. */
    start(intervalMs?: number): void;
    /** Stop the monitor sweep loop. */
    stop(): void;
}
