/**
 * Ledger Reconciliation_Job (Billing_Service).
 *
 * Runs every 24h at a fixed UTC time and, for each user, compares the balance
 * computed from the append-only `billing_events` ledger (`sum(amount_usd)`)
 * against the separately-cached balance.
 *
 *  - A difference of at most $0.01 is within tolerance and ignored.
 *  - A larger difference is a mismatch: an admin alert is raised naming the user
 *    and the discrepancy, and NEITHER balance is mutated (fail-visible, never
 *    fail-silent; the ledger is the source of truth and stays append-only).
 *  - A comparison that cannot complete (ledger unreadable, cached balance
 *    unavailable, etc.) raises an incomplete alert and the user is retried on the
 *    next scheduled run.
 *
 * The pure decision logic (balance sum + tolerance comparison) is separated from
 * all I/O, and the ledger store, admin-alert hook, clock, and timer are injected
 * so the job is testable without Redis, a database, a real Notification_Service,
 * or wall-clock waits.
 *
 * Coordination: task 9.1 introduces `billingLedger.ts` exporting a
 * `BillingLedgerStore` (list-by-developer) and a pure `computeBalance(events)`.
 * Until that lands, this module depends only on the shared `BillingEvent` type,
 * a minimal injected store (`listByDeveloper`), and its own balance sum. When
 * 9.1 is present, `computeBalance` here can be replaced by the shared one and
 * `LedgerReconciliationStore.listByDeveloper` satisfied by `BillingLedgerStore`.
 *
 * Requirements: 7.3, 7.4, 7.5
 */

import type { BillingEvent } from "@neuralgrid/shared";

// --- Configuration ---

/** Absolute balance difference at or below this (USD) is within tolerance. */
export const RECONCILE_TOLERANCE_USD = 0.01;

/** Fixed cadence: the ledger reconciliation runs once per 24 hours. */
export const RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Default fixed time-of-day (UTC) at which the daily run fires. */
export const DEFAULT_RECONCILE_HOUR_UTC = 0;
export const DEFAULT_RECONCILE_MINUTE_UTC = 0;

// --- Pure decision logic (no I/O; unit/property testable) ---

/**
 * Balance as the sum of a user's billing-event amounts. `amount_usd` is negative
 * for `charge` and positive for `credit`/`topup`/`refund`, so a plain sum yields
 * the balance (design Req 7.2). Mirrors the ledger's `computeBalance`; swap for
 * the shared one from `billingLedger.ts` (task 9.1) when available.
 */
export function computeBalance(events: BillingEvent[]): number {
  return events.reduce((sum, e) => sum + e.amount_usd, 0);
}

export interface BalanceEvaluation {
  computed_balance: number;
  cached_balance: number;
  /** Signed difference `computed - cached`. */
  difference: number;
  /** True only when `|difference|` exceeds the tolerance. */
  mismatch: boolean;
}

/**
 * Compare a computed balance against a cached balance. A mismatch is flagged if
 * and only if the absolute difference strictly exceeds the tolerance; a
 * difference exactly at the tolerance is treated as reconciled.
 */
export function evaluateBalance(
  computedBalance: number,
  cachedBalance: number,
  tolerance: number = RECONCILE_TOLERANCE_USD
): BalanceEvaluation {
  const difference = computedBalance - cachedBalance;
  return {
    computed_balance: computedBalance,
    cached_balance: cachedBalance,
    difference,
    mismatch: Math.abs(difference) > tolerance,
  };
}

/** Convenience predicate for the tolerance comparison. */
export function isBalanceMismatch(
  computedBalance: number,
  cachedBalance: number,
  tolerance: number = RECONCILE_TOLERANCE_USD
): boolean {
  return Math.abs(computedBalance - cachedBalance) > tolerance;
}

/**
 * Milliseconds from `now` until the next occurrence of the fixed UTC time-of-day.
 * Always returns a value in `(0, 24h]` so a run scheduled exactly at the target
 * time waits a full day rather than firing immediately.
 */
export function msUntilNextRun(
  now: number,
  hourUtc: number = DEFAULT_RECONCILE_HOUR_UTC,
  minuteUtc: number = DEFAULT_RECONCILE_MINUTE_UTC
): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    hourUtc,
    minuteUtc,
    0,
    0
  );
  const delta = next - now;
  return delta > 0 ? delta : delta + RECONCILE_INTERVAL_MS;
}

// --- Injected collaborators ---

/**
 * Minimal ledger + cached-balance surface consumed by the job. `listByDeveloper`
 * matches the method task 9.1's `BillingLedgerStore` exposes; `getCachedBalance`
 * reads the separately-maintained cached balance the ledger is checked against.
 */
export interface LedgerReconciliationStore {
  /** Every user id whose balance should be reconciled this run. */
  listUserIds(): Promise<string[]>;
  /** All billing events for a user (source of the computed balance). */
  listByDeveloper(userId: string): Promise<BillingEvent[]>;
  /**
   * The user's cached balance, or `null` when it cannot be determined; `null`
   * makes the comparison incomplete (alert + retry next run) rather than a
   * spurious mismatch.
   */
  getCachedBalance(userId: string): Promise<number | null>;
}

export type ReconciliationAlert =
  | {
      kind: "ledger_mismatch";
      user_id: string;
      computed_balance: number;
      cached_balance: number;
      /** Signed `computed - cached`, in USD. */
      discrepancy_usd: number;
      detected_at: number;
    }
  | {
      kind: "ledger_incomplete";
      user_id: string;
      reason: string;
      detected_at: number;
    };

/**
 * Injected admin-alert sink. The concrete Notification_Service is not built yet,
 * so callers supply the delivery mechanism; this module never hard-wires paging.
 */
export type ReconciliationAlertHook = (
  alert: ReconciliationAlert
) => void | Promise<void>;

/** Injectable clock so runs are testable without the real wall clock. */
export type Clock = () => number;

/** Opaque handle returned by the injectable timer. */
export type TimerHandle = unknown;

/** Injectable timer so the daily schedule is testable without real delays. */
export interface TimerLike {
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

const defaultTimer: TimerLike = {
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

// --- Run result ---

export interface LedgerMismatch {
  user_id: string;
  computed_balance: number;
  cached_balance: number;
  discrepancy_usd: number;
}

export interface ReconciliationRunResult {
  /** Number of users whose comparison completed (reconciled or mismatched). */
  checked: number;
  /** Users flagged beyond tolerance (no balances were mutated). */
  mismatches: LedgerMismatch[];
  /** Users whose comparison could not complete; retried on the next run. */
  incomplete: string[];
}

export interface RunOnceOptions {
  /** Extra users carried over from a prior incomplete run, retried this run. */
  carryOver?: Iterable<string>;
  now?: number;
}

// --- Single reconciliation pass ---

/**
 * Reconcile every user once. Per-user failures are isolated so one unreadable
 * user never aborts the whole run. No balance is ever mutated: mismatches are
 * only flagged and alerted (Req 7.4). Incomplete comparisons alert and are
 * returned for retry on the next run (Req 7.5).
 */
export async function runLedgerReconciliationOnce(
  store: LedgerReconciliationStore,
  alertHook: ReconciliationAlertHook,
  options: RunOnceOptions = {}
): Promise<ReconciliationRunResult> {
  const now = options.now ?? Date.now();

  const userIds = new Set<string>();
  try {
    for (const id of await store.listUserIds()) userIds.add(id);
  } catch (err) {
    // If the user roster itself is unreadable there is nothing to iterate;
    // still fold in any carried-over users below so they are not lost.
    void err;
  }
  if (options.carryOver) {
    for (const id of options.carryOver) userIds.add(id);
  }

  const mismatches: LedgerMismatch[] = [];
  const incomplete: string[] = [];
  let checked = 0;

  for (const userId of userIds) {
    try {
      const events = await store.listByDeveloper(userId);
      const cached = await store.getCachedBalance(userId);
      if (cached === null || cached === undefined) {
        throw new Error("cached balance unavailable");
      }

      const evaluation = evaluateBalance(computeBalance(events), cached);
      checked += 1;

      if (evaluation.mismatch) {
        mismatches.push({
          user_id: userId,
          computed_balance: evaluation.computed_balance,
          cached_balance: evaluation.cached_balance,
          discrepancy_usd: evaluation.difference,
        });
        // Alert only — never mutate either balance (Req 7.4).
        await alertHook({
          kind: "ledger_mismatch",
          user_id: userId,
          computed_balance: evaluation.computed_balance,
          cached_balance: evaluation.cached_balance,
          discrepancy_usd: evaluation.difference,
          detected_at: now,
        });
      }
    } catch (err) {
      incomplete.push(userId);
      await alertHook({
        kind: "ledger_incomplete",
        user_id: userId,
        reason: err instanceof Error ? err.message : String(err),
        detected_at: now,
      });
    }
  }

  return { checked, mismatches, incomplete };
}

// --- Scheduled daily job ---

export interface LedgerReconciliationDeps {
  store: LedgerReconciliationStore;
  alertHook: ReconciliationAlertHook;
  now?: Clock;
  timer?: TimerLike;
  hourUtc?: number;
  minuteUtc?: number;
  /** Optional observer invoked after every completed pass. */
  onRun?: (result: ReconciliationRunResult) => void;
}

export interface LedgerReconciliationHandle {
  /** Cancel all future scheduled runs. */
  stop(): void;
}

/**
 * Start the daily ledger reconciliation. The first pass fires at the next
 * occurrence of the fixed UTC time-of-day, then every 24h thereafter. Users
 * whose comparison was incomplete are carried into the following run for retry.
 */
export function startLedgerReconciliation(
  deps: LedgerReconciliationDeps
): LedgerReconciliationHandle {
  const now: Clock = deps.now ?? (() => Date.now());
  const timer: TimerLike = deps.timer ?? defaultTimer;
  const hourUtc = deps.hourUtc ?? DEFAULT_RECONCILE_HOUR_UTC;
  const minuteUtc = deps.minuteUtc ?? DEFAULT_RECONCILE_MINUTE_UTC;

  let handle: TimerHandle | undefined;
  let stopped = false;
  let carryOver: string[] = [];

  const runAndReschedule = async (): Promise<void> => {
    if (stopped) return;
    let result: ReconciliationRunResult | undefined;
    try {
      result = await runLedgerReconciliationOnce(deps.store, deps.alertHook, {
        carryOver,
        now: now(),
      });
      carryOver = result.incomplete;
      deps.onRun?.(result);
    } finally {
      // Always reschedule so a transient failure never kills the cadence.
      scheduleNext(RECONCILE_INTERVAL_MS);
    }
  };

  const scheduleNext = (delayMs: number): void => {
    if (stopped) return;
    handle = timer.setTimeout(() => {
      void runAndReschedule();
    }, delayMs);
  };

  scheduleNext(msUntilNextRun(now(), hourUtc, minuteUtc));

  return {
    stop() {
      stopped = true;
      if (handle !== undefined) timer.clearTimeout(handle);
    },
  };
}
