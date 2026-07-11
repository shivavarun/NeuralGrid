/**
 * Data_Retention_Job — job input PII minimization by scheduled purge (Req 15).
 *
 * Runs at least once every 24h and purges the `input_ref` content of Jobs whose
 * creation timestamp is older than 30 days, so purged input is no longer
 * retrievable through any System interface (Req 15.1). A Job is EXCLUDED from the
 * purge while its owner has opted into extended retention (Req 15.2). Only input
 * content is purged: each Job's cost, status, and timestamp fields are left
 * intact and unchanged (Req 15.3). If a purge fails, the Job is retained in a
 * `pending-purge` state and retried on the next scheduled run (Req 15.4) — since
 * a failed purge never stamps `retention_purged_at`, the Job simply reappears as
 * a candidate next run.
 *
 * Design shape (mirrors `ledgerReconciliation.ts`, `secretsManager.ts`,
 * `auditLog.ts`):
 *  - The pure purge-eligibility decision (`isPurgeEligible`: age > 30 days AND
 *    not opted-in AND not already purged) is separated from all I/O, so it is
 *    trivially unit/property testable.
 *  - The Job_Store surface (`listPurgeable` / `purgeInput` / `markPendingPurge`),
 *    the extended-retention lookup, the clock, and the timer are all injected, so
 *    the job runs without a real database, clock, or wall-clock waits. A
 *    PostgreSQL-backed store writing the migration-002 `jobs.retention_purged_at`
 *    column satisfies the same interface unchanged.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4
 */

// --- Configuration ---

/** Retention window: inputs older than 30 days are purged (Req 15.1). */
export const RETENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Cadence: the Data_Retention_Job runs at least once every 24h (Req 15.1). */
export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Job status recorded when a purge attempt fails (Req 15.4). */
export const PENDING_PURGE_STATUS = "pending-purge";

// --- Domain types ---

/**
 * The minimal Job projection the retention job reasons about. Field names mirror
 * the migration-002 `jobs` columns so a DB-backed store maps 1:1.
 */
export interface RetentionJob {
  /** Job id. */
  id: string;
  /** Owning user, used for the extended-retention opt-in lookup (Req 15.2). */
  user_id: string;
  /** Job creation time as epoch milliseconds (the 30-day age anchor). */
  created_at: number;
  /**
   * When this Job's input was purged (epoch ms), or `null`/`undefined` if it has
   * not been purged. A purged Job is never re-purged.
   */
  retention_purged_at?: number | null;
}

// --- Pure decision logic (no I/O; unit/property testable) ---

/** A Job's age in milliseconds at time `now`. */
export function jobAgeMs(createdAt: number, now: number): number {
  return now - createdAt;
}

/**
 * Whether a Job's input is old enough to purge: strictly older than the
 * retention window measured from its creation timestamp. A Job exactly at the
 * window boundary is not yet purgeable.
 */
export function isOlderThanRetentionWindow(
  createdAt: number,
  now: number,
  windowMs: number = RETENTION_WINDOW_MS
): boolean {
  return jobAgeMs(createdAt, now) > windowMs;
}

/**
 * The core purge-eligibility decision (Req 15.1, 15.2): a Job's input is purged
 * iff it is older than the retention window AND its owner has NOT opted into
 * extended retention AND it has not already been purged.
 *
 * Pure — no clock, no I/O. `optedIntoExtendedRetention` is resolved by the
 * caller and passed in so this stays a total function of its inputs.
 */
export function isPurgeEligible(
  job: RetentionJob,
  now: number,
  optedIntoExtendedRetention: boolean,
  windowMs: number = RETENTION_WINDOW_MS
): boolean {
  if (job.retention_purged_at != null) return false; // already purged
  if (optedIntoExtendedRetention) return false; // opted-in: excluded (Req 15.2)
  return isOlderThanRetentionWindow(job.created_at, now, windowMs);
}

// --- Injected collaborators ---

/**
 * Job_Store surface consumed by the retention job. A PostgreSQL-backed
 * implementation over the migration-002 `jobs` table satisfies this interface;
 * the MVP ships {@link InMemoryRetentionJobStore}.
 */
export interface RetentionJobStore {
  /**
   * Every Job that is a purge candidate this run: not yet purged
   * (`retention_purged_at IS NULL`). Filtering by age/opt-in is done by the pure
   * decision so the store stays a thin query.
   */
  listPurgeable(): Promise<RetentionJob[]>;
  /**
   * Render a Job's `input_ref` content unretrievable and stamp
   * `retention_purged_at = purgedAt`. Cost, status, and timestamp fields MUST be
   * left intact and unchanged (Req 15.3). Rejects (throws) if the purge fails.
   */
  purgeInput(jobId: string, purgedAt: number): Promise<void>;
  /**
   * Record that a Job could not be purged and is awaiting retry (Req 15.4). The
   * Job's `retention_purged_at` stays unset so it is re-listed next run.
   */
  markPendingPurge(jobId: string): Promise<void>;
}

/**
 * Extended-retention opt-in lookup (Req 15.2). Resolves true when the user has
 * opted into extended retention (and any configured extended period has not yet
 * elapsed), in which case their Jobs are excluded from the purge.
 */
export type ExtendedRetentionLookup = (
  userId: string
) => boolean | Promise<boolean>;

/** Injectable clock so runs are testable without the real wall clock. */
export type Clock = () => number;

/** Opaque handle returned by the injectable timer. */
export type TimerHandle = unknown;

/** Injectable timer so the schedule is testable without real delays. */
export interface TimerLike {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const defaultTimer: TimerLike = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

// --- Run result ---

export interface RetentionRunResult {
  /** Job ids whose input was purged this run. */
  purged: string[];
  /** Job ids whose purge failed and are now `pending-purge` (retried next run). */
  pendingPurge: string[];
  /**
   * Job ids that were candidates but not eligible this run (opted-in, too young,
   * or whose opt-in lookup could not be resolved — the last are retried next
   * run, never purged on uncertainty so opted-in data is never lost).
   */
  skipped: string[];
}

export interface RunOnceOptions {
  now?: number;
}

// --- Single retention pass ---

/**
 * Purge every eligible Job's input once. Per-Job failures are isolated so one
 * bad purge never aborts the run. A Job whose opt-in status cannot be resolved
 * is skipped (never purged on uncertainty) and retried next run.
 */
export async function runDataRetentionOnce(
  store: RetentionJobStore,
  extendedRetentionLookup: ExtendedRetentionLookup,
  options: RunOnceOptions = {}
): Promise<RetentionRunResult> {
  const now = options.now ?? Date.now();

  const purged: string[] = [];
  const pendingPurge: string[] = [];
  const skipped: string[] = [];

  let candidates: RetentionJob[];
  try {
    candidates = await store.listPurgeable();
  } catch {
    // Nothing to iterate this run; the next scheduled run retries.
    return { purged, pendingPurge, skipped };
  }

  for (const job of candidates) {
    // Resolve opt-in; on lookup failure, do NOT purge (avoid deleting possibly
    // opted-in data) — skip and let the next run retry.
    let optedIn: boolean;
    try {
      optedIn = await extendedRetentionLookup(job.user_id);
    } catch {
      skipped.push(job.id);
      continue;
    }

    if (!isPurgeEligible(job, now, optedIn)) {
      skipped.push(job.id);
      continue;
    }

    try {
      await store.purgeInput(job.id, now);
      purged.push(job.id);
    } catch {
      // Purge failed: retain the Job in `pending-purge` and retry next run
      // (Req 15.4). A failure marking pending-purge is itself non-fatal.
      try {
        await store.markPendingPurge(job.id);
      } catch {
        /* best-effort; the Job stays unpurged and is re-listed next run */
      }
      pendingPurge.push(job.id);
    }
  }

  return { purged, pendingPurge, skipped };
}

// --- In-memory store (dev/test) ---

/**
 * In-memory {@link RetentionJobStore} for dev and tests. Models the input purge
 * as clearing `input_ref` and stamping `retention_purged_at`, leaving all other
 * fields untouched (Req 15.3). NOT for production.
 */
export interface InMemoryJobRecord extends RetentionJob {
  /** The purgeable input content; set to `null` once purged (Req 15.1). */
  input_ref: string | null;
  /** Other fields the purge must not touch (Req 15.3). */
  status?: string;
  cost_usd?: number | null;
}

export class InMemoryRetentionJobStore implements RetentionJobStore {
  private readonly jobs = new Map<string, InMemoryJobRecord>();
  /** Job ids for which the next `purgeInput` call should throw (test hook). */
  readonly failOn = new Set<string>();

  constructor(initial: InMemoryJobRecord[] = []) {
    for (const job of initial) this.jobs.set(job.id, { ...job });
  }

  async listPurgeable(): Promise<RetentionJob[]> {
    return [...this.jobs.values()]
      .filter((j) => j.retention_purged_at == null)
      .map((j) => ({
        id: j.id,
        user_id: j.user_id,
        created_at: j.created_at,
        retention_purged_at: j.retention_purged_at ?? null,
      }));
  }

  async purgeInput(jobId: string, purgedAt: number): Promise<void> {
    if (this.failOn.has(jobId)) {
      throw new Error(`simulated purge failure for ${jobId}`);
    }
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`unknown job ${jobId}`);
    // Purge input only; cost/status/timestamps stay intact (Req 15.3).
    job.input_ref = null;
    job.retention_purged_at = purgedAt;
  }

  async markPendingPurge(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`unknown job ${jobId}`);
    job.status = PENDING_PURGE_STATUS;
  }

  /** Read a stored record (test/inspection helper). */
  get(jobId: string): InMemoryJobRecord | undefined {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : undefined;
  }
}

// --- Scheduled job ---

export interface DataRetentionDeps {
  store: RetentionJobStore;
  extendedRetentionLookup: ExtendedRetentionLookup;
  now?: Clock;
  timer?: TimerLike;
  /**
   * Run cadence in ms; defaults to 24h. Must be ≤ 24h to satisfy "at least once
   * every 24 hours" (Req 15.1).
   */
  intervalMs?: number;
  /** Optional observer invoked after every completed pass. */
  onRun?: (result: RetentionRunResult) => void;
}

export interface DataRetentionHandle {
  /** Cancel all future scheduled runs. */
  stop(): void;
}

/**
 * Start the Data_Retention_Job. The first pass fires immediately, then every
 * `intervalMs` (default 24h) thereafter, satisfying "at least once every 24
 * hours" (Req 15.1). A transient failure never kills the cadence.
 */
export function startDataRetention(
  deps: DataRetentionDeps
): DataRetentionHandle {
  const now: Clock = deps.now ?? (() => Date.now());
  const timer: TimerLike = deps.timer ?? defaultTimer;
  const intervalMs = deps.intervalMs ?? RETENTION_INTERVAL_MS;

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
      const result = await runDataRetentionOnce(
        deps.store,
        deps.extendedRetentionLookup,
        { now: now() }
      );
      deps.onRun?.(result);
    } finally {
      // Always reschedule so a transient failure never stops the cadence.
      scheduleNext(intervalMs);
    }
  };

  // First pass fires immediately.
  scheduleNext(0);

  return {
    stop() {
      stopped = true;
      if (handle !== undefined) timer.clearTimeout(handle);
    },
  };
}
