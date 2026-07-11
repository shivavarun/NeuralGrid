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
/** Rolling window over which dispatch/provider metrics are computed (Req 18.1, 18.3). */
export declare const METRICS_WINDOW_MS: number;
/** Fixed cadence at which the metrics are emitted (Req 18.2). */
export declare const METRICS_EMIT_INTERVAL_MS = 60000;
/** Number of most-recent estimation outcomes the accuracy rate is derived from (Req 18.4). */
export declare const ESTIMATOR_ACCURACY_SAMPLE_SIZE = 100;
/** Minimum outcomes required before an accuracy rate is computed at all (Req 18.5). */
export declare const ESTIMATOR_ACCURACY_MIN_SAMPLES = 10;
/**
 * A single completed dispatch attempt (Req 18.1). `latency_ms` is the dispatch
 * latency (time from becoming dispatchable to the attempt completing); `success`
 * is true for an accepted dispatch, false for an error/dispatch-timeout.
 */
export interface DispatchSample {
    /** ms epoch at which the dispatch attempt completed. */
    timestamp: number;
    /** Provider the attempt was dispatched to, for the per-provider error rate. */
    provider_id: string;
    /** Whether the dispatch attempt succeeded. */
    success: boolean;
    /** Dispatch latency in milliseconds. */
    latency_ms: number;
}
/**
 * A single estimation outcome used to derive the estimator accuracy rate
 * (Req 18.4, 18.5). An `Estimator_Miss_Record` is the `accurate: false` case;
 * accurate estimations are the `accurate: true` case. Only `created_at` and
 * `accurate` are needed for the metric.
 *
 * Note: the shipped `estimator_registry` table durably stores only misses. A
 * meaningful accuracy *rate* additionally needs the accurate outcomes, so the
 * collector is fed the full outcome stream here; the recency window and the
 * minimum-volume gate below apply to that stream. (Flagged for confirmation.)
 */
export interface EstimationOutcomeRecord {
    /** ms epoch at which the estimation outcome was recorded. */
    created_at: number;
    /** True when the estimate was accurate; false for an Estimator_Miss_Record. */
    accurate: boolean;
}
export interface ProviderErrorRate {
    provider_id: string;
    /** Fraction of in-window attempts to this provider that failed, in [0, 1]. */
    error_rate: number;
    /** Total in-window attempts to this provider (0 when the provider is idle). */
    attempts: number;
}
export interface DispatchMetrics {
    /** Count of dispatch attempts completed within the rolling window. */
    throughput: number;
    /** Fraction of in-window attempts that succeeded, in [0, 1]. */
    success_rate: number;
    /** Median dispatch latency (ms) over the window; 0 when no samples. */
    p50_latency_ms: number;
    /** 95th-percentile dispatch latency (ms) over the window; 0 when no samples. */
    p95_latency_ms: number;
    /** Per-provider error rate over the same window. */
    provider_error_rates: ProviderErrorRate[];
}
/** Estimator accuracy: a rate in [0, 1], or explicitly not-available (Req 18.5). */
export type EstimatorAccuracy = {
    available: true;
    rate: number;
} | {
    available: false;
};
/**
 * Keep only samples whose timestamp falls within the rolling window ending at
 * `now` (strictly newer than `now - windowMs`). Shared by the dispatch and
 * per-provider computations so both use an identical window (Req 18.1, 18.3).
 */
export declare function withinWindow<T extends {
    timestamp: number;
}>(samples: readonly T[], now: number, windowMs?: number): T[];
/**
 * Percentile (0-100) of a numeric sample set using the nearest-rank method:
 * sort ascending, take the value at rank `ceil(p/100 * n)` (1-based). Returns 0
 * for an empty set. Deterministic and dependency-free so a property test can
 * mirror it exactly.
 */
export declare function percentile(values: readonly number[], p: number): number;
/**
 * Success rate = successes / total, in [0, 1]. An empty window is defined as a
 * rate of 1 (no failures observed) so an idle scheduler is not reported as
 * unhealthy.
 */
export declare function successRate(samples: readonly DispatchSample[]): number;
/**
 * Per-provider error rate over the given (already windowed) samples. Every
 * provider in `providerIds` is reported, including idle ones (0 attempts →
 * 0 error rate), so a configured provider never silently drops off the metric
 * (Req 18.3).
 */
export declare function providerErrorRates(samples: readonly DispatchSample[], providerIds: readonly string[]): ProviderErrorRate[];
/**
 * Compute the full set of rolling-window dispatch metrics (Req 18.1, 18.3) from
 * raw samples. Prunes to the window first, then derives throughput, success
 * rate, P50/P95 latency, and per-provider error rates over the identical window.
 */
export declare function computeDispatchMetrics(samples: readonly DispatchSample[], providerIds: readonly string[], now: number, windowMs?: number): DispatchMetrics;
/**
 * Estimator accuracy rate from the most recent `ESTIMATOR_ACCURACY_SAMPLE_SIZE`
 * outcome records (or all if fewer). Records are ordered by `created_at` and the
 * newest are taken. Fewer than `ESTIMATOR_ACCURACY_MIN_SAMPLES` records →
 * not-available; otherwise the rate is the fraction of accurate outcomes
 * (Req 18.4, 18.5).
 */
export declare function estimatorAccuracy(records: readonly EstimationOutcomeRecord[], sampleSize?: number, minSamples?: number): EstimatorAccuracy;
/** A single emitted metric point: a gauge value with optional labels. */
export interface MetricPoint {
    name: string;
    value: number;
    labels?: Record<string, string>;
}
/**
 * Prometheus-style sink. `emit` sets a gauge to `value` for the given label set;
 * the concrete backend (a `prom-client` registry, a push gateway, a test spy) is
 * injected by the caller so this module never hard-wires a metrics backend.
 */
export interface MetricsSink {
    emit(point: MetricPoint): void | Promise<void>;
}
/** Metric names emitted by the collector (stable, Prometheus-style). */
export declare const METRIC_NAMES: {
    readonly throughput: "job_scheduler_dispatch_throughput";
    readonly successRate: "job_scheduler_dispatch_success_rate";
    readonly p50Latency: "job_scheduler_dispatch_latency_p50_ms";
    readonly p95Latency: "job_scheduler_dispatch_latency_p95_ms";
    readonly providerErrorRate: "job_scheduler_provider_error_rate";
    readonly estimatorAccuracy: "job_scheduler_estimator_accuracy_rate";
    readonly estimatorAccuracyAvailable: "job_scheduler_estimator_accuracy_available";
};
/**
 * Side-effecting collaborators, injected so the collector stays testable without
 * a real Job_Store, Redis metric window, or metrics backend.
 */
export interface MetricsDeps {
    /** Current time in ms epoch (injectable clock). */
    now(): number;
    /** Destination sink for emitted gauges. */
    sink: MetricsSink;
    /** All dispatch samples at least as recent as the rolling window. */
    loadDispatchSamples(): Promise<readonly DispatchSample[]>;
    /** Every configured provider id, so idle providers still report a rate. */
    loadProviderIds(): Promise<readonly string[]>;
    /** Estimation outcome records for the accuracy rate (newest needed). */
    loadEstimationOutcomes(): Promise<readonly EstimationOutcomeRecord[]>;
}
export declare class MetricsCollector {
    private readonly deps;
    private timer;
    constructor(deps: MetricsDeps);
    /**
     * One emission cycle (Req 18.1-18.5): load the current samples, compute the
     * rolling-window dispatch/provider metrics and the estimator accuracy, and
     * push every gauge to the sink.
     */
    emitOnce(): Promise<void>;
    /** Begin the fixed 60s emission loop (Req 18.2). Idempotent. */
    start(intervalMs?: number): void;
    /** Stop the emission loop. */
    stop(): void;
}
