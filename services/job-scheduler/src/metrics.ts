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

// --- Configuration ---

/** Rolling window over which dispatch/provider metrics are computed (Req 18.1, 18.3). */
export const METRICS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Fixed cadence at which the metrics are emitted (Req 18.2). */
export const METRICS_EMIT_INTERVAL_MS = 60_000; // 60 seconds

/** Number of most-recent estimation outcomes the accuracy rate is derived from (Req 18.4). */
export const ESTIMATOR_ACCURACY_SAMPLE_SIZE = 100;

/** Minimum outcomes required before an accuracy rate is computed at all (Req 18.5). */
export const ESTIMATOR_ACCURACY_MIN_SAMPLES = 10;

// --- Metric samples fed into the aggregation ---

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

// --- Aggregated result shape ---

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
export type EstimatorAccuracy =
  | { available: true; rate: number }
  | { available: false };

// --- Pure aggregation logic (no I/O; unit/property testable) ---

/**
 * Keep only samples whose timestamp falls within the rolling window ending at
 * `now` (strictly newer than `now - windowMs`). Shared by the dispatch and
 * per-provider computations so both use an identical window (Req 18.1, 18.3).
 */
export function withinWindow<T extends { timestamp: number }>(
  samples: readonly T[],
  now: number,
  windowMs: number = METRICS_WINDOW_MS
): T[] {
  const cutoff = now - windowMs;
  return samples.filter((s) => s.timestamp > cutoff);
}

/**
 * Percentile (0-100) of a numeric sample set using the nearest-rank method:
 * sort ascending, take the value at rank `ceil(p/100 * n)` (1-based). Returns 0
 * for an empty set. Deterministic and dependency-free so a property test can
 * mirror it exactly.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

/**
 * Success rate = successes / total, in [0, 1]. An empty window is defined as a
 * rate of 1 (no failures observed) so an idle scheduler is not reported as
 * unhealthy.
 */
export function successRate(samples: readonly DispatchSample[]): number {
  if (samples.length === 0) return 1;
  const successes = samples.reduce((n, s) => n + (s.success ? 1 : 0), 0);
  return successes / samples.length;
}

/**
 * Per-provider error rate over the given (already windowed) samples. Every
 * provider in `providerIds` is reported, including idle ones (0 attempts →
 * 0 error rate), so a configured provider never silently drops off the metric
 * (Req 18.3).
 */
export function providerErrorRates(
  samples: readonly DispatchSample[],
  providerIds: readonly string[]
): ProviderErrorRate[] {
  const attempts = new Map<string, number>();
  const failures = new Map<string, number>();
  for (const id of providerIds) {
    attempts.set(id, 0);
    failures.set(id, 0);
  }
  for (const s of samples) {
    // Count providers observed in samples even if not in providerIds.
    attempts.set(s.provider_id, (attempts.get(s.provider_id) ?? 0) + 1);
    if (!failures.has(s.provider_id)) failures.set(s.provider_id, 0);
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
export function computeDispatchMetrics(
  samples: readonly DispatchSample[],
  providerIds: readonly string[],
  now: number,
  windowMs: number = METRICS_WINDOW_MS
): DispatchMetrics {
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
export function estimatorAccuracy(
  records: readonly EstimationOutcomeRecord[],
  sampleSize: number = ESTIMATOR_ACCURACY_SAMPLE_SIZE,
  minSamples: number = ESTIMATOR_ACCURACY_MIN_SAMPLES
): EstimatorAccuracy {
  const recent = [...records]
    .sort((a, b) => a.created_at - b.created_at)
    .slice(-sampleSize);

  if (recent.length < minSamples) {
    return { available: false };
  }

  const accurate = recent.reduce((n, r) => n + (r.accurate ? 1 : 0), 0);
  return { available: true, rate: accurate / recent.length };
}

// --- Injectable metrics sink (Prometheus-style gauge emit) ---

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
export const METRIC_NAMES = {
  throughput: "job_scheduler_dispatch_throughput",
  successRate: "job_scheduler_dispatch_success_rate",
  p50Latency: "job_scheduler_dispatch_latency_p50_ms",
  p95Latency: "job_scheduler_dispatch_latency_p95_ms",
  providerErrorRate: "job_scheduler_provider_error_rate",
  estimatorAccuracy: "job_scheduler_estimator_accuracy_rate",
  estimatorAccuracyAvailable: "job_scheduler_estimator_accuracy_available",
} as const;

// --- Orchestration ---

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

export class MetricsCollector {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: MetricsDeps) {}

  /**
   * One emission cycle (Req 18.1-18.5): load the current samples, compute the
   * rolling-window dispatch/provider metrics and the estimator accuracy, and
   * push every gauge to the sink.
   */
  async emitOnce(): Promise<void> {
    const now = this.deps.now();
    const [samples, providerIds, outcomes] = await Promise.all([
      this.deps.loadDispatchSamples(),
      this.deps.loadProviderIds(),
      this.deps.loadEstimationOutcomes(),
    ]);

    const metrics = computeDispatchMetrics(samples, providerIds, now);
    const accuracy = estimatorAccuracy(outcomes);

    await this.deps.sink.emit({ name: METRIC_NAMES.throughput, value: metrics.throughput });
    await this.deps.sink.emit({ name: METRIC_NAMES.successRate, value: metrics.success_rate });
    await this.deps.sink.emit({ name: METRIC_NAMES.p50Latency, value: metrics.p50_latency_ms });
    await this.deps.sink.emit({ name: METRIC_NAMES.p95Latency, value: metrics.p95_latency_ms });

    for (const p of metrics.provider_error_rates) {
      await this.deps.sink.emit({
        name: METRIC_NAMES.providerErrorRate,
        value: p.error_rate,
        labels: { provider_id: p.provider_id },
      });
    }

    // Emit an availability gauge always, plus the rate only when available
    // (Req 18.5: not-available is a distinct state, not a computed value).
    await this.deps.sink.emit({
      name: METRIC_NAMES.estimatorAccuracyAvailable,
      value: accuracy.available ? 1 : 0,
    });
    if (accuracy.available) {
      await this.deps.sink.emit({
        name: METRIC_NAMES.estimatorAccuracy,
        value: accuracy.rate,
      });
    }
  }

  /** Begin the fixed 60s emission loop (Req 18.2). Idempotent. */
  start(intervalMs: number = METRICS_EMIT_INTERVAL_MS): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.emitOnce();
    }, intervalMs);
  }

  /** Stop the emission loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
