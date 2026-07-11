/**
 * Distributed tracing per Job — one trace per submitted Job (Req 20).
 *
 * Every submitted Job gets exactly one trace. Each trace carries spans for the
 * four stages of the job lifecycle — submission, estimation, dispatch, and
 * result — and every span records a start and an end time (Req 20.1, 20.2).
 * All spans for a Job are retrievable by `job_id` (Req 20.3); a lookup for an
 * unknown `job_id` returns not-found (Req 20.4); and traces are retained at
 * least 30 days after the job completes (Req 20.5).
 *
 * Design shape (mirrors `dataRetention.ts`, `auditLog.ts`, `billingLedger.ts`):
 *  - Pure helpers (`buildTrace`, `openSpan`, `closeSpan`, `spanDurationMs`,
 *    `isTraceExpired`) carry no I/O — id/clock are injected — so they are
 *    trivially unit/property testable.
 *  - `TraceStore` is an injectable, async, DB-ready interface. The MVP ships an
 *    in-memory implementation keyed by `job_id`; a PostgreSQL-backed store over
 *    a `traces`/`spans` table satisfies the same interface unchanged.
 *  - `createTracer` is the light-touch wiring surface: the job flow
 *    (`routes/jobs.ts`) is handed a tracer and calls `startTrace` /
 *    `startSpan` / `endSpan` (or the `withSpan` wrapper) rather than being
 *    rewritten around tracing.
 *
 * Requirements: 20.1, 20.2, 20.3, 20.4, 20.5
 */

// --- Configuration ---

/** The four job-lifecycle stages that get a span (Req 20.2). */
export const SPAN_STAGES = [
  'submission',
  'estimation',
  'dispatch',
  'result',
] as const;

/** A span name is one of the four fixed lifecycle stages. */
export type SpanName = (typeof SPAN_STAGES)[number];

/** Traces are retained at least 30 days after job completion (Req 20.5). */
export const TRACE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Cadence for the optional trace-purge sweep; ≤ retention window. */
export const TRACE_PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// --- Domain types ---

/**
 * A single timed span within a trace. `start_ms`/`end_ms` are epoch
 * milliseconds; `end_ms` is `null` until the span is closed (Req 20.2).
 */
export interface Span {
  /** One of the four fixed lifecycle stages. */
  name: SpanName;
  /** Span start time, epoch ms. */
  start_ms: number;
  /** Span end time, epoch ms; `null` while the span is still open. */
  end_ms: number | null;
  /** Optional outcome tag, e.g. 'ok' | 'error'; free-form for callers. */
  status?: string;
  /** Optional structured attributes (tier, provider, error_code, ...). */
  attributes?: Record<string, unknown>;
}

/**
 * One trace per Job. Field names are chosen so a DB-backed store maps cleanly to
 * a `traces` row plus a child `spans` collection.
 */
export interface Trace {
  /** Trace id (opaque). */
  trace_id: string;
  /** The Job this trace belongs to — the retrieval key (Req 20.3). */
  job_id: string;
  /** Lifecycle spans, in the order they were opened. */
  spans: Span[];
  /** Trace creation time, epoch ms. */
  created_at: number;
  /**
   * When the job reached a terminal state, epoch ms; `null` until completed.
   * The 30-day retention window is anchored here (Req 20.5).
   */
  completed_at: number | null;
}

/** Result of a trace retrieval: found with the trace, or not-found (Req 20.4). */
export type TraceLookup =
  | { found: true; trace: Trace }
  | { found: false };

// --- ID + clock (injectable for testing) ---

let traceIdCounter = 0;

/** Default trace-id generator. */
export function generateTraceId(): string {
  traceIdCounter++;
  return `trace_${traceIdCounter}_${Date.now()}`;
}

/** Reset the module-level trace-id counter (test helper). */
export function resetTraceIdCounter(): void {
  traceIdCounter = 0;
}

/** Injectable clock so traces are testable without the real wall clock. */
export type Clock = () => number;

/** Deps for building traces/spans; default to real id/clock, injectable in tests. */
export interface TracingDeps {
  generateId?: () => string;
  now?: Clock;
}

// --- Pure trace/span logic (no I/O) ---

/**
 * Build a fresh trace for a job with no spans yet. Pure given its injected
 * id/clock (Req 20.1).
 */
export function buildTrace(jobId: string, deps: TracingDeps = {}): Trace {
  const generateId = deps.generateId ?? generateTraceId;
  const now = deps.now ?? (() => Date.now());
  return {
    trace_id: generateId(),
    job_id: jobId,
    spans: [],
    created_at: now(),
    completed_at: null,
  };
}

/** Whether a trace already has a span for the given stage. */
export function hasSpan(trace: Trace, name: SpanName): boolean {
  return trace.spans.some((s) => s.name === name);
}

/**
 * Open a span for `name` at `startMs`, returning a new trace value (the input is
 * not mutated). If a span for that stage already exists it is left unchanged so
 * a stage is never double-opened.
 */
export function openSpan(
  trace: Trace,
  name: SpanName,
  startMs: number,
  attributes?: Record<string, unknown>
): Trace {
  if (hasSpan(trace, name)) return trace;
  const span: Span = { name, start_ms: startMs, end_ms: null, attributes };
  return { ...trace, spans: [...trace.spans, span] };
}

/**
 * Close the open span for `name` at `endMs`, returning a new trace value. A
 * missing or already-closed span is left unchanged. If `name` is 'result', the
 * job is treated as terminal and `completed_at` is stamped (anchoring the
 * 30-day retention window, Req 20.5) unless already set.
 */
export function closeSpan(
  trace: Trace,
  name: SpanName,
  endMs: number,
  patch?: { status?: string; attributes?: Record<string, unknown> }
): Trace {
  const spans = trace.spans.map((s) => {
    if (s.name !== name || s.end_ms !== null) return s;
    return {
      ...s,
      end_ms: endMs,
      ...(patch?.status !== undefined ? { status: patch.status } : {}),
      ...(patch?.attributes !== undefined
        ? { attributes: { ...s.attributes, ...patch.attributes } }
        : {}),
    };
  });
  const completed_at =
    name === 'result' && trace.completed_at == null ? endMs : trace.completed_at;
  return { ...trace, spans, completed_at };
}

/** Explicitly mark a trace's job as completed at `completedMs` (idempotent). */
export function markCompleted(trace: Trace, completedMs: number): Trace {
  if (trace.completed_at != null) return trace;
  return { ...trace, completed_at: completedMs };
}

/** A span's duration in ms, or `null` if it is still open. */
export function spanDurationMs(span: Span): number | null {
  return span.end_ms == null ? null : span.end_ms - span.start_ms;
}

/**
 * Whether a trace has aged past the retention window and may be purged: it is
 * completed AND its completion is strictly older than the 30-day window. An
 * uncompleted trace is never expired (Req 20.5).
 */
export function isTraceExpired(
  trace: Trace,
  now: number,
  windowMs: number = TRACE_RETENTION_MS
): boolean {
  if (trace.completed_at == null) return false;
  return now - trace.completed_at > windowMs;
}

// --- Injectable, DB-ready store interface ---

/**
 * Trace store consumed by the tracer. A PostgreSQL-backed implementation over a
 * `traces`/`spans` schema satisfies this interface; the MVP ships
 * {@link InMemoryTraceStore}.
 */
export interface TraceStore {
  /** Persist a newly created trace (one per job, Req 20.1). */
  create(trace: Trace): Promise<Trace>;
  /**
   * Replace the stored trace for a job with `next`. Used to persist span
   * open/close edits produced by the pure helpers.
   */
  save(trace: Trace): Promise<Trace>;
  /** Retrieve the trace (with all spans) for a job, or not-found (Req 20.3, 20.4). */
  getByJobId(jobId: string): Promise<TraceLookup>;
  /**
   * Remove all traces expired past the retention window as of `now`, returning
   * the purged job ids (Req 20.5).
   */
  purgeExpired(now: number, windowMs?: number): Promise<string[]>;
}

// --- In-memory store (MVP) ---

/**
 * In-memory {@link TraceStore} keyed by `job_id`. NOT for production. Stores
 * defensive copies so callers can't mutate persisted traces after the fact.
 */
export class InMemoryTraceStore implements TraceStore {
  private readonly byJobId = new Map<string, Trace>();

  async create(trace: Trace): Promise<Trace> {
    const stored = cloneTrace(trace);
    this.byJobId.set(stored.job_id, stored);
    return cloneTrace(stored);
  }

  async save(trace: Trace): Promise<Trace> {
    const stored = cloneTrace(trace);
    this.byJobId.set(stored.job_id, stored);
    return cloneTrace(stored);
  }

  async getByJobId(jobId: string): Promise<TraceLookup> {
    const trace = this.byJobId.get(jobId);
    return trace ? { found: true, trace: cloneTrace(trace) } : { found: false };
  }

  async purgeExpired(
    now: number,
    windowMs: number = TRACE_RETENTION_MS
  ): Promise<string[]> {
    const purged: string[] = [];
    for (const [jobId, trace] of this.byJobId) {
      if (isTraceExpired(trace, now, windowMs)) {
        this.byJobId.delete(jobId);
        purged.push(jobId);
      }
    }
    return purged;
  }

  /** Number of stored traces (test/inspection helper). */
  size(): number {
    return this.byJobId.size;
  }

  /** Clear all state (test helper). */
  reset(): void {
    this.byJobId.clear();
  }
}

/** Deep-ish copy of a trace so stored and returned values don't alias. */
function cloneTrace(trace: Trace): Trace {
  return {
    ...trace,
    spans: trace.spans.map((s) => ({
      ...s,
      attributes: s.attributes ? { ...s.attributes } : s.attributes,
    })),
  };
}

/** Convenience factory for the default (in-memory) store. */
export function createInMemoryTraceStore(): InMemoryTraceStore {
  return new InMemoryTraceStore();
}

// --- Light-touch wiring surface ---

/**
 * The tracer handed to the job flow. `startTrace` opens one trace per job;
 * `startSpan`/`endSpan` bracket a lifecycle stage; `withSpan` brackets an async
 * step automatically (closing the span on both success and failure). All
 * operations no-op gracefully if the trace is absent, so tracing never breaks
 * the job flow.
 */
export interface Tracer {
  /** Start (and persist) the single trace for a job (Req 20.1). */
  startTrace(jobId: string): Promise<Trace>;
  /** Open the span for a lifecycle stage (Req 20.2). */
  startSpan(
    jobId: string,
    name: SpanName,
    attributes?: Record<string, unknown>
  ): Promise<void>;
  /** Close the open span for a lifecycle stage, recording its end time (Req 20.2). */
  endSpan(
    jobId: string,
    name: SpanName,
    patch?: { status?: string; attributes?: Record<string, unknown> }
  ): Promise<void>;
  /**
   * Bracket an async step with a span: open on entry, close on both resolve and
   * reject. The original result is returned / the original error re-thrown so
   * wrapping is transparent to the caller's control flow.
   */
  withSpan<T>(
    jobId: string,
    name: SpanName,
    step: () => Promise<T>,
    attributes?: Record<string, unknown>
  ): Promise<T>;
  /** Retrieve all spans for a job, or not-found (Req 20.3, 20.4). */
  getTrace(jobId: string): Promise<TraceLookup>;
}

export interface TracerDeps extends TracingDeps {
  store: TraceStore;
}

/**
 * Build a {@link Tracer} bound to a store. This is the light-touch integration
 * point: the job flow is handed a tracer and calls it, rather than being
 * rewritten around tracing internals.
 */
export function createTracer(deps: TracerDeps): Tracer {
  const now: Clock = deps.now ?? (() => Date.now());
  const buildDeps: TracingDeps = { generateId: deps.generateId, now };

  async function startTrace(jobId: string): Promise<Trace> {
    const trace = buildTrace(jobId, buildDeps);
    return deps.store.create(trace);
  }

  async function startSpan(
    jobId: string,
    name: SpanName,
    attributes?: Record<string, unknown>
  ): Promise<void> {
    const lookup = await deps.store.getByJobId(jobId);
    if (!lookup.found) return;
    const next = openSpan(lookup.trace, name, now(), attributes);
    await deps.store.save(next);
  }

  async function endSpan(
    jobId: string,
    name: SpanName,
    patch?: { status?: string; attributes?: Record<string, unknown> }
  ): Promise<void> {
    const lookup = await deps.store.getByJobId(jobId);
    if (!lookup.found) return;
    const next = closeSpan(lookup.trace, name, now(), patch);
    await deps.store.save(next);
  }

  async function withSpan<T>(
    jobId: string,
    name: SpanName,
    step: () => Promise<T>,
    attributes?: Record<string, unknown>
  ): Promise<T> {
    await startSpan(jobId, name, attributes);
    try {
      const result = await step();
      await endSpan(jobId, name, { status: 'ok' });
      return result;
    } catch (err) {
      await endSpan(jobId, name, { status: 'error' });
      throw err;
    }
  }

  return {
    startTrace,
    startSpan,
    endSpan,
    withSpan,
    getTrace: (jobId: string) => deps.store.getByJobId(jobId),
  };
}

// --- Optional scheduled retention sweep ---

export type TimerHandle = unknown;

export interface TimerLike {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const defaultTimer: TimerLike = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface TracePurgeDeps {
  store: TraceStore;
  now?: Clock;
  timer?: TimerLike;
  /** Sweep cadence in ms; defaults to 24h (≤ the 30-day retention window). */
  intervalMs?: number;
  /** Retention window in ms; defaults to 30 days (Req 20.5). */
  windowMs?: number;
  /** Optional observer invoked with the purged job ids after each sweep. */
  onPurge?: (purged: string[]) => void;
}

export interface TracePurgeHandle {
  stop(): void;
}

/**
 * Start a background sweep that purges traces older than the retention window.
 * Traces are retained AT LEAST 30 days after completion (Req 20.5); this sweep
 * only ever removes traces already past that window. The first sweep fires
 * immediately, then every `intervalMs` thereafter.
 */
export function startTracePurge(deps: TracePurgeDeps): TracePurgeHandle {
  const now: Clock = deps.now ?? (() => Date.now());
  const timer: TimerLike = deps.timer ?? defaultTimer;
  const intervalMs = deps.intervalMs ?? TRACE_PURGE_INTERVAL_MS;
  const windowMs = deps.windowMs ?? TRACE_RETENTION_MS;

  let handle: TimerHandle | undefined;
  let stopped = false;

  const scheduleNext = (delayMs: number): void => {
    if (stopped) return;
    handle = timer.setTimeout(() => {
      void runAndReschedule();
    }, delayMs);
  };

  const runAndReschedule = async (): Promise<void> => {
    if (stopped) return;
    try {
      const purged = await deps.store.purgeExpired(now(), windowMs);
      deps.onPurge?.(purged);
    } finally {
      scheduleNext(intervalMs);
    }
  };

  scheduleNext(0);

  return {
    stop() {
      stopped = true;
      if (handle !== undefined) timer.clearTimeout(handle);
    },
  };
}
