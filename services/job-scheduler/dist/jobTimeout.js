"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobTimeoutMonitor = exports.TERMINAL_STATUSES = exports.JOB_TIMEOUT_MONITOR_INTERVAL_MS = exports.JOB_TIMEOUT_MULTIPLIER = void 0;
exports.computeJobTimeout = computeJobTimeout;
exports.isTimedOut = isTimedOut;
exports.isTerminalStatus = isTerminalStatus;
exports.shouldDiscardLateResult = shouldDiscardLateResult;
const shared_1 = require("@neuralgrid/shared");
// --- Configuration ---
/** Job_Timeout is the estimated runtime multiplied by this factor (Req 4.1). */
exports.JOB_TIMEOUT_MULTIPLIER = 3;
/** Default cadence for the timeout-monitor sweep. */
exports.JOB_TIMEOUT_MONITOR_INTERVAL_MS = 5000;
/** Job statuses that are terminal — a late result for these is discarded. */
exports.TERMINAL_STATUSES = new Set([
    "COMPLETE",
    "FAILED",
]);
// --- Pure logic (no I/O; unit/property testable) ---
/**
 * Compute a job's Job_Timeout at dispatch: `estimated_runtime_ms * 3`, anchored
 * to the dispatch timestamp (Req 4.1).
 */
function computeJobTimeout(jobId, estimatedRuntimeMs, dispatchedAt) {
    return {
        job_id: jobId,
        dispatched_at: dispatchedAt,
        timeout_ms: estimatedRuntimeMs * exports.JOB_TIMEOUT_MULTIPLIER,
    };
}
/**
 * True once a dispatched job's Job_Timeout has elapsed, measured from its
 * dispatch timestamp (Req 4.2).
 */
function isTimedOut(timeout, now) {
    return now - timeout.dispatched_at >= timeout.timeout_ms;
}
/** Whether a status is terminal (case-insensitive). */
function isTerminalStatus(status) {
    return exports.TERMINAL_STATUSES.has(status.toUpperCase());
}
/**
 * Terminal guard for late provider results (Req 4.6). A result delivered for a
 * job that has already reached a terminal status (e.g. FAILED via JOB_TIMEOUT)
 * must be discarded so the job's status is never changed away from FAILED.
 */
function shouldDiscardLateResult(currentStatus) {
    return isTerminalStatus(currentStatus);
}
class JobTimeoutMonitor {
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * One monitor sweep (Req 4.2, 4.5): fail every non-terminal dispatched job
     * whose Job_Timeout has elapsed and record its TIMEOUT Estimator_Miss.
     */
    async processOnce() {
        const now = this.deps.now();
        const active = await this.deps.loadActiveTimeouts();
        for (const { timeout, job_type } of active) {
            if (!isTimedOut(timeout, now))
                continue;
            await this.failTimedOut(timeout.job_id, job_type);
        }
    }
    async failTimedOut(jobId, jobType) {
        await this.deps.markFailed(jobId, shared_1.ErrorCode.JOB_TIMEOUT);
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
    async handleProviderResult(jobId) {
        const status = await this.deps.getJobStatus(jobId);
        if (status !== null && shouldDiscardLateResult(status)) {
            return false;
        }
        return true;
    }
    /** Begin the monitor sweep loop. Idempotent. */
    start(intervalMs = exports.JOB_TIMEOUT_MONITOR_INTERVAL_MS) {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.processOnce();
        }, intervalMs);
    }
    /** Stop the monitor sweep loop. */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
}
exports.JobTimeoutMonitor = JobTimeoutMonitor;
//# sourceMappingURL=jobTimeout.js.map