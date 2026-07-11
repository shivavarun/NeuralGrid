"use strict";
/**
 * SLO measurement helpers (Req 21).
 *
 * Pure computation functions plus a lightweight in-memory tracker that
 * services wire into their request/dispatch/outcome paths. Targets:
 *   - API_Gateway availability      ≥ 99.5% non-5xx           (Req 21.1)
 *   - Job_Scheduler P50 dispatch    < 800 ms                  (Req 21.2)
 *   - Job success rate              ≥ 90% COMPLETE / terminal (Req 21.3)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SloTracker = void 0;
exports.computeAvailability = computeAvailability;
exports.isNon5xx = isNon5xx;
exports.percentile = percentile;
exports.computeP50 = computeP50;
exports.computeSuccessRate = computeSuccessRate;
exports.evaluateAvailabilitySlo = evaluateAvailabilitySlo;
exports.evaluateP50DispatchSlo = evaluateP50DispatchSlo;
exports.evaluateJobSuccessRateSlo = evaluateJobSuccessRateSlo;
const constants_1 = require("./constants");
// --- Pure computations ---
/** Availability = non-5xx / total. Empty sample is treated as fully available (1). */
function computeAvailability(non5xxCount, totalCount) {
    if (totalCount <= 0)
        return 1;
    return non5xxCount / totalCount;
}
/** True when an HTTP status code is NOT a 5xx server error. */
function isNon5xx(statusCode) {
    return statusCode < 500 || statusCode >= 600;
}
/**
 * Nearest-rank percentile over a sample. `p` in [0, 100].
 * Empty sample returns 0.
 */
function percentile(values, p) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length) - 1;
    const idx = Math.min(Math.max(rank, 0), sorted.length - 1);
    return sorted[idx];
}
/** P50 (median by nearest-rank) of dispatch latencies. */
function computeP50(latenciesMs) {
    return percentile(latenciesMs, 50);
}
/** Success rate = completed / terminal. Empty sample is treated as fully successful (1). */
function computeSuccessRate(completedCount, terminalCount) {
    if (terminalCount <= 0)
        return 1;
    return completedCount / terminalCount;
}
// --- Target evaluation ---
function evaluateAvailabilitySlo(non5xxCount, totalCount) {
    const value = computeAvailability(non5xxCount, totalCount);
    return { value, target: constants_1.SLO_AVAILABILITY_TARGET, met: value >= constants_1.SLO_AVAILABILITY_TARGET };
}
function evaluateP50DispatchSlo(latenciesMs) {
    const value = computeP50(latenciesMs);
    return {
        value,
        target: constants_1.SLO_P50_DISPATCH_LATENCY_MS,
        met: value < constants_1.SLO_P50_DISPATCH_LATENCY_MS,
    };
}
function evaluateJobSuccessRateSlo(completedCount, terminalCount) {
    const value = computeSuccessRate(completedCount, terminalCount);
    return {
        value,
        target: constants_1.SLO_JOB_SUCCESS_RATE_TARGET,
        met: value >= constants_1.SLO_JOB_SUCCESS_RATE_TARGET,
    };
}
// --- Stateful tracker ---
/**
 * Minimal self-contained SLO tracker. Services record raw events; `report()`
 * evaluates the current sample against each target. Reset per measurement
 * window as needed.
 */
class SloTracker {
    constructor() {
        this.non5xx = 0;
        this.totalResponses = 0;
        this.dispatchLatencies = [];
        this.completed = 0;
        this.terminal = 0;
    }
    /** Record an HTTP response for the availability SLO. */
    recordResponse(statusCode) {
        this.totalResponses++;
        if (isNon5xx(statusCode))
            this.non5xx++;
    }
    /** Record a submission→dispatch latency (ms) for the P50 SLO. Negatives ignored. */
    recordDispatchLatency(latencyMs) {
        if (Number.isFinite(latencyMs) && latencyMs >= 0) {
            this.dispatchLatencies.push(latencyMs);
        }
    }
    /** Record a terminal job outcome for the success-rate SLO. */
    recordJobOutcome(outcome) {
        this.terminal++;
        if (outcome === "COMPLETE")
            this.completed++;
    }
    /** Evaluate all tracked SLOs against their targets. */
    report() {
        return {
            availability: evaluateAvailabilitySlo(this.non5xx, this.totalResponses),
            p50DispatchLatencyMs: evaluateP50DispatchSlo(this.dispatchLatencies),
            jobSuccessRate: evaluateJobSuccessRateSlo(this.completed, this.terminal),
        };
    }
    /** Clear all recorded samples (e.g. at the start of a new measurement window). */
    reset() {
        this.non5xx = 0;
        this.totalResponses = 0;
        this.dispatchLatencies = [];
        this.completed = 0;
        this.terminal = 0;
    }
}
exports.SloTracker = SloTracker;
//# sourceMappingURL=slo.js.map