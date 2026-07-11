"use strict";
/**
 * Operational metrics collection for the Job_Scheduler.
 *
 * Computes, over a rolling 5-minute window, job throughput, job success rate,
 * P50/P95 dispatch latency, and a per-provider error rate, and emits them on a
 * fixed 60s cadence to an injectable Prometheus-style metrics sink. Separately,
 * derives an estimator accuracy rate from the most recent 100 estimation
 * outcome records, emitting `not-available` when fewer than 10 exist.
 *
 * Following the softQueue.ts / circuitBreaker.ts / jobTimeout.ts convention, the
 * pure aggregation logic (window pruning, rate/percentile computation, estimator
 * accuracy) is separated from the side-effecting collaborators (clock, sink, and
 * sample loaders), which are injected so the collector is testable without a
 * real Job_Store, Redis metric window, or a running metrics backend.
 *
 * Requirements: 18.1, 18.2, 18.3, 18.4, 18.5
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = exports.METRIC_NAMES = exports.ESTIMATOR_ACCURACY_MIN_SAMPLES = exports.ESTIMATOR_ACCURACY_SAMPLE_SIZE = exports.METRICS_EMIT_INTERVAL_MS = exports.METRICS_WINDOW_MS = void 0;
exports.withinWindow = withinWindow;
exports.percentile = percentile;
exports.successRate = successRate;
exports.providerErrorRates = providerErrorRates;
exports.computeDispatchMetrics = computeDispatchMetrics;
exports.estimatorAccuracy = estimatorAccuracy;
// --- Configuration ---
/** Rolling window over which dispatch/provider metrics are computed (Req 18.1, 18.3). */
exports.METRICS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
/** Fixed cadence at which the metrics are emitted (Req 18.2). */
exports.METRICS_EMIT_INTERVAL_MS = 60000; // 60 seconds
/** Number of most-recent estimation outcomes the accuracy rate is derived from (Req 18.4). */
exports.ESTIMATOR_ACCURACY_SAMPLE_SIZE = 100;
/** Minimum outcomes required before an accuracy rate is computed at all (Req 18.5). */
exports.ESTIMATOR_ACCURACY_MIN_SAMPLES = 10;
// --- Pure aggregation logic (no I/O; unit/property testable) ---
/**
 * Keep only samples whose timestamp falls within the rolling window ending at
 * `now` (strictly newer than `now - windowMs`). Shared by the dispatch and
 * per-provider computations so both use an identical window (Req 18.1, 18.3).
 */
function withinWindow(samples, now, windowMs = exports.METRICS_WINDOW_MS) {
    const cutoff = now - windowMs;
    return samples.filter((s) => s.timestamp > cutoff);
}
/**
 * Percentile (0-100) of a numeric sample set using the nearest-rank method:
 * sort ascending, take the value at rank `ceil(p/100 * n)` (1-based). Returns 0
 * for an empty set. Deterministic and dependency-free so a property test can
 * mirror it exactly.
 */
function percentile(values, p) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    if (p <= 0)
        return sorted[0];
    if (p >= 100)
        return sorted[sorted.length - 1];
    const rank = Math.ceil((p / 100) * sorted.length);
    const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
    return sorted[index];
}
/**
 * Success rate = successes / total, in [0, 1]. An empty window is defined as a
 * rate of 1 (no failures observed) so an idle scheduler is not reported as
 * unhealthy.
 */
function successRate(samples) {
    if (samples.length === 0)
        return 1;
    const successes = samples.reduce((n, s) => n + (s.success ? 1 : 0), 0);
    return successes / samples.length;
}
/**
 * Per-provider error rate over the given (already windowed) samples. Every
 * provider in `providerIds` is reported, including idle ones (0 attempts →
 * 0 error rate), so a configured provider never silently drops off the metric
 * (Req 18.3).
 */
function providerErrorRates(samples, providerIds) {
    const attempts = new Map();
    const failures = new Map();
    for (const id of providerIds) {
        attempts.set(id, 0);
        failures.set(id, 0);
    }
    for (const s of samples) {
        // Count providers observed in samples even if not in providerIds.
        attempts.set(s.provider_id, (attempts.get(s.provider_id) ?? 0) + 1);
        if (!failures.has(s.provider_id))
            failures.set(s.provider_id, 0);
        if (!s.success) {
            failures.set(s.provider_id, (failures.get(s.provider_id) ?? 0) + 1);
        }
    }
    return [...attempts.keys()].map((provider_id) => {
        const total = attempts.get(provider_id) ?? 0;
        const failed = failures.get(provider_id) ?? 0;
        return {
            provider_id,
            attempts: total,
            error_rate: total === 0 ? 0 : failed / total,
        };
    });
}
/**
 * Compute the full set of rolling-window dispatch metrics (Req 18.1, 18.3) from
 * raw samples. Prunes to the window first, then derives throughput, success
 * rate, P50/P95 latency, and per-provider error rates over the identical window.
 */
function computeDispatchMetrics(samples, providerIds, now, windowMs = exports.METRICS_WINDOW_MS) {
    const windowed = withinWindow(samples, now, windowMs);
    const latencies = windowed.map((s) => s.latency_ms);
    return {
        throughput: windowed.length,
        success_rate: successRate(windowed),
        p50_latency_ms: percentile(latencies, 50),
        p95_latency_ms: percentile(latencies, 95),
        provider_error_rates: providerErrorRates(windowed, providerIds),
    };
}
/**
 * Estimator accuracy rate from the most recent `ESTIMATOR_ACCURACY_SAMPLE_SIZE`
 * outcome records (or all if fewer). Records are ordered by `created_at` and the
 * newest are taken. Fewer than `ESTIMATOR_ACCURACY_MIN_SAMPLES` records →
 * not-available; otherwise the rate is the fraction of accurate outcomes
 * (Req 18.4, 18.5).
 */
function estimatorAccuracy(records, sampleSize = exports.ESTIMATOR_ACCURACY_SAMPLE_SIZE, minSamples = exports.ESTIMATOR_ACCURACY_MIN_SAMPLES) {
    const recent = [...records]
        .sort((a, b) => a.created_at - b.created_at)
        .slice(-sampleSize);
    if (recent.length < minSamples) {
        return { available: false };
    }
    const accurate = recent.reduce((n, r) => n + (r.accurate ? 1 : 0), 0);
    return { available: true, rate: accurate / recent.length };
}
/** Metric names emitted by the collector (stable, Prometheus-style). */
exports.METRIC_NAMES = {
    throughput: "job_scheduler_dispatch_throughput",
    successRate: "job_scheduler_dispatch_success_rate",
    p50Latency: "job_scheduler_dispatch_latency_p50_ms",
    p95Latency: "job_scheduler_dispatch_latency_p95_ms",
    providerErrorRate: "job_scheduler_provider_error_rate",
    estimatorAccuracy: "job_scheduler_estimator_accuracy_rate",
    estimatorAccuracyAvailable: "job_scheduler_estimator_accuracy_available",
};
class MetricsCollector {
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * One emission cycle (Req 18.1-18.5): load the current samples, compute the
     * rolling-window dispatch/provider metrics and the estimator accuracy, and
     * push every gauge to the sink.
     */
    async emitOnce() {
        const now = this.deps.now();
        const [samples, providerIds, outcomes] = await Promise.all([
            this.deps.loadDispatchSamples(),
            this.deps.loadProviderIds(),
            this.deps.loadEstimationOutcomes(),
        ]);
        const metrics = computeDispatchMetrics(samples, providerIds, now);
        const accuracy = estimatorAccuracy(outcomes);
        await this.deps.sink.emit({ name: exports.METRIC_NAMES.throughput, value: metrics.throughput });
        await this.deps.sink.emit({ name: exports.METRIC_NAMES.successRate, value: metrics.success_rate });
        await this.deps.sink.emit({ name: exports.METRIC_NAMES.p50Latency, value: metrics.p50_latency_ms });
        await this.deps.sink.emit({ name: exports.METRIC_NAMES.p95Latency, value: metrics.p95_latency_ms });
        for (const p of metrics.provider_error_rates) {
            await this.deps.sink.emit({
                name: exports.METRIC_NAMES.providerErrorRate,
                value: p.error_rate,
                labels: { provider_id: p.provider_id },
            });
        }
        // Emit an availability gauge always, plus the rate only when available
        // (Req 18.5: not-available is a distinct state, not a computed value).
        await this.deps.sink.emit({
            name: exports.METRIC_NAMES.estimatorAccuracyAvailable,
            value: accuracy.available ? 1 : 0,
        });
        if (accuracy.available) {
            await this.deps.sink.emit({
                name: exports.METRIC_NAMES.estimatorAccuracy,
                value: accuracy.rate,
            });
        }
    }
    /** Begin the fixed 60s emission loop (Req 18.2). Idempotent. */
    start(intervalMs = exports.METRICS_EMIT_INTERVAL_MS) {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.emitOnce();
        }, intervalMs);
    }
    /** Stop the emission loop. */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
}
exports.MetricsCollector = MetricsCollector;
//# sourceMappingURL=metrics.js.map