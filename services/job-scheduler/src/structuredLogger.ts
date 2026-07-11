/**
 * Structured job state transition logging.
 *
 * Every job state transition emits exactly one JSON log entry
 * `{job_id, user_id, request_id, from_status, to_status, timestamp}` where
 * `timestamp` is ISO 8601, UTC, millisecond precision. Emission is retried up to
 * 3 times on failure and NEVER blocks or rolls back the transition it describes
 * (Req 17.2): the transition is assumed already committed, so a total emission
 * failure is swallowed and reported, not thrown. Exactly-one-entry semantics are
 * enforced by deduping on `{job_id, from_status, to_status, transition_seq}`
 * (Req 17.3) — a key is only marked emitted after a successful emission, so a
 * transition whose emission fails can still be re-attempted later without ever
 * producing a second entry once one has landed.
 *
 * Following the softQueue.ts / circuitBreaker.ts / jobTimeout.ts convention, the
 * pure logic (entry construction, dedupe-key computation, timestamp formatting)
 * is separated from the side-effecting log sink, which is injected so tests can
 * capture emissions and simulate failures without a real logging backend.
 *
 * Requirements: 17.1, 17.2, 17.3
 */

// --- Configuration ---

/**
 * Maximum number of emission retries after the initial attempt (Req 17.2).
 * Total emission attempts per transition is therefore `1 + MAX_EMIT_RETRIES`.
 */
export const MAX_EMIT_RETRIES = 3;

// --- Data shapes ---

/**
 * A job state transition to be logged. `occurred_at` is a ms-epoch instant used
 * to derive the ISO timestamp; `transition_seq` is a per-job monotonically
 * increasing sequence number that, together with the statuses, uniquely
 * identifies the transition for dedupe (Req 17.3).
 */
export interface JobTransition {
  job_id: string;
  user_id: string;
  request_id: string;
  from_status: string;
  to_status: string;
  transition_seq: number;
  /** Instant the transition occurred, ms epoch. Defaults to `deps.now()`. */
  occurred_at?: number;
}

/** The structured JSON log entry emitted per transition (Req 17.1). */
export interface TransitionLogEntry {
  job_id: string;
  user_id: string;
  request_id: string;
  from_status: string;
  to_status: string;
  /** ISO 8601, UTC, millisecond precision. */
  timestamp: string;
}

// --- Pure logic (no I/O; unit/property testable) ---

/**
 * Format a ms-epoch instant as an ISO 8601 UTC timestamp with millisecond
 * precision (e.g. `2024-01-02T03:04:05.678Z`). `Date#toISOString` is always UTC
 * and always millisecond precision, satisfying Req 17.1.
 */
export function formatTimestamp(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Dedupe key uniquely identifying a transition (Req 17.3). Newlines/pipes in the
 * component fields cannot collide because `job_id` and the statuses are
 * controlled identifiers, and `transition_seq` is numeric; the fields are joined
 * with a delimiter that does not appear in any of them.
 */
export function dedupeKey(transition: JobTransition): string {
  return [
    transition.job_id,
    transition.from_status,
    transition.to_status,
    transition.transition_seq,
  ].join("|");
}

/**
 * Build the well-formed structured log entry for a transition (Req 17.1). Pure:
 * the timestamp is derived from `occurred_at` (falling back to `nowMs`).
 */
export function buildLogEntry(
  transition: JobTransition,
  nowMs: number
): TransitionLogEntry {
  return {
    job_id: transition.job_id,
    user_id: transition.user_id,
    request_id: transition.request_id,
    from_status: transition.from_status,
    to_status: transition.to_status,
    timestamp: formatTimestamp(transition.occurred_at ?? nowMs),
  };
}

// --- Injectable collaborators ---

/**
 * The log sink. `emit` may reject to simulate a transient failure; the logger
 * retries up to `MAX_EMIT_RETRIES` times. Injected so tests can capture entries
 * and force failures.
 */
export interface LogSink {
  emit(entry: TransitionLogEntry): Promise<void> | void;
}

/**
 * Dedupe store recording which transition keys have already been successfully
 * emitted. Defaults to an in-memory `Set`, but is injectable so a distributed
 * deployment can back dedupe with Redis for exactly-one semantics across
 * scheduler instances (mirrors the injectable Redis surface in circuitBreaker).
 */
export interface DedupeStore {
  has(key: string): boolean | Promise<boolean>;
  markEmitted(key: string): void | Promise<void>;
}

/** Default process-local dedupe store. */
export class InMemoryDedupeStore implements DedupeStore {
  private readonly seen = new Set<string>();
  has(key: string): boolean {
    return this.seen.has(key);
  }
  markEmitted(key: string): void {
    this.seen.add(key);
  }
}

export interface StructuredLoggerDeps {
  sink: LogSink;
  /** Current time in ms epoch (injectable clock). Defaults to `Date.now`. */
  now?: () => number;
  /** Dedupe store. Defaults to a fresh in-memory store. */
  dedupeStore?: DedupeStore;
  /** Retries after the initial attempt. Defaults to `MAX_EMIT_RETRIES`. */
  maxRetries?: number;
}

// --- Outcome ---

export type LogOutcome =
  /** The entry was emitted (possibly after retries). */
  | { status: "emitted"; entry: TransitionLogEntry; attempts: number }
  /** A prior emission for this transition already landed; nothing re-emitted. */
  | { status: "duplicate"; key: string }
  /** All attempts failed; the transition is untouched and the failure swallowed. */
  | { status: "failed"; entry: TransitionLogEntry; attempts: number };

// --- Orchestration ---

export class StructuredTransitionLogger {
  private readonly now: () => number;
  private readonly dedupeStore: DedupeStore;
  private readonly maxRetries: number;

  constructor(private readonly deps: StructuredLoggerDeps) {
    this.now = deps.now ?? Date.now;
    this.dedupeStore = deps.dedupeStore ?? new InMemoryDedupeStore();
    this.maxRetries = deps.maxRetries ?? MAX_EMIT_RETRIES;
  }

  /**
   * Log a single job state transition (Req 17.1–17.3).
   *
   * - Skips emission when this transition's dedupe key has already been emitted
   *   (exactly-one-entry, Req 17.3).
   * - Attempts emission once, then retries up to `maxRetries` times on failure
   *   (Req 17.2).
   * - Only marks the key emitted after a successful `emit`, so a fully-failed
   *   emission can be retried by a later call without risking a duplicate.
   * - Never throws and never signals the caller to roll back: a total failure
   *   resolves to a `failed` outcome so the committed transition is unaffected
   *   (Req 17.2).
   */
  async log(transition: JobTransition): Promise<LogOutcome> {
    const key = dedupeKey(transition);
    if (await this.dedupeStore.has(key)) {
      return { status: "duplicate", key };
    }

    const entry = buildLogEntry(transition, this.now());
    const totalAttempts = this.maxRetries + 1;

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        await this.deps.sink.emit(entry);
        await this.dedupeStore.markEmitted(key);
        return { status: "emitted", entry, attempts: attempt };
      } catch {
        // Swallow and retry; the transition itself is never rolled back.
        if (attempt === totalAttempts) {
          return { status: "failed", entry, attempts: attempt };
        }
      }
    }

    // Unreachable: the loop always returns. Kept for exhaustiveness.
    return { status: "failed", entry, attempts: totalAttempts };
  }
}
