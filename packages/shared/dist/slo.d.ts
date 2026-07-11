/**
 * SLO measurement helpers (Req 21).
 *
 * Pure computation functions plus a lightweight in-memory tracker that
 * services wire into their request/dispatch/outcome paths. Targets:
 *   - API_Gateway availability      ≥ 99.5% non-5xx           (Req 21.1)
 *   - Job_Scheduler P50 dispatch    < 800 ms                  (Req 21.2)
 *   - Job success rate              ≥ 90% COMPLETE / terminal (Req 21.3)
 */
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
/** Availability = non-5xx / total. Empty sample is treated as fully available (1). */
export declare function computeAvailability(non5xxCount: number, totalCount: number): number;
/** True when an HTTP status code is NOT a 5xx server error. */
export declare function isNon5xx(statusCode: number): boolean;
/**
 * Nearest-rank percentile over a sample. `p` in [0, 100].
 * Empty sample returns 0.
 */
export declare function percentile(values: number[], p: number): number;
/** P50 (median by nearest-rank) of dispatch latencies. */
export declare function computeP50(latenciesMs: number[]): number;
/** Success rate = completed / terminal. Empty sample is treated as fully successful (1). */
export declare function computeSuccessRate(completedCount: number, terminalCount: number): number;
export declare function evaluateAvailabilitySlo(non5xxCount: number, totalCount: number): SloStatus;
export declare function evaluateP50DispatchSlo(latenciesMs: number[]): SloStatus;
export declare function evaluateJobSuccessRateSlo(completedCount: number, terminalCount: number): SloStatus;
/**
 * Minimal self-contained SLO tracker. Services record raw events; `report()`
 * evaluates the current sample against each target. Reset per measurement
 * window as needed.
 */
export declare class SloTracker {
    private non5xx;
    private totalResponses;
    private dispatchLatencies;
    private completed;
    private terminal;
    /** Record an HTTP response for the availability SLO. */
    recordResponse(statusCode: number): void;
    /** Record a submission→dispatch latency (ms) for the P50 SLO. Negatives ignored. */
    recordDispatchLatency(latencyMs: number): void;
    /** Record a terminal job outcome for the success-rate SLO. */
    recordJobOutcome(outcome: SloJobOutcome): void;
    /** Evaluate all tracked SLOs against their targets. */
    report(): SloReport;
    /** Clear all recorded samples (e.g. at the start of a new measurement window). */
    reset(): void;
}
//# sourceMappingURL=slo.d.ts.map