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
/** Absolute balance difference at or below this (USD) is within tolerance. */
export declare const RECONCILE_TOLERANCE_USD = 0.01;
/** Fixed cadence: the ledger reconciliation runs once per 24 hours. */
export declare const RECONCILE_INTERVAL_MS: number;
/** Default fixed time-of-day (UTC) at which the daily run fires. */
export declare const DEFAULT_RECONCILE_HOUR_UTC = 0;
export declare const DEFAULT_RECONCILE_MINUTE_UTC = 0;
/**
 * Balance as the sum of a user's billing-event amounts. `amount_usd` is negative
 * for `charge` and positive for `credit`/`topup`/`refund`, so a plain sum yields
 * the balance (design Req 7.2). Mirrors the ledger's `computeBalance`; swap for
 * the shared one from `billingLedger.ts` (task 9.1) when available.
 */
export declare function computeBalance(events: BillingEvent[]): number;
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
export declare function evaluateBalance(computedBalance: number, cachedBalance: number, tolerance?: number): BalanceEvaluation;
/** Convenience predicate for the tolerance comparison. */
export declare function isBalanceMismatch(computedBalance: number, cachedBalance: number, tolerance?: number): boolean;
/**
 * Milliseconds from `now` until the next occurrence of the fixed UTC time-of-day.
 * Always returns a value in `(0, 24h]` so a run scheduled exactly at the target
 * time waits a full day rather than firing immediately.
 */
export declare function msUntilNextRun(now: number, hourUtc?: number, minuteUtc?: number): number;
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
export type ReconciliationAlert = {
    kind: "ledger_mismatch";
    user_id: string;
    computed_balance: number;
    cached_balance: number;
    /** Signed `computed - cached`, in USD. */
    discrepancy_usd: number;
    detected_at: number;
} | {
    kind: "ledger_incomplete";
    user_id: string;
    reason: string;
    detected_at: number;
};
/**
 * Injected admin-alert sink. The concrete Notification_Service is not built yet,
 * so callers supply the delivery mechanism; this module never hard-wires paging.
 */
export type ReconciliationAlertHook = (alert: ReconciliationAlert) => void | Promise<void>;
/** Injectable clock so runs are testable without the real wall clock. */
export type Clock = () => number;
/** Opaque handle returned by the injectable timer. */
export type TimerHandle = unknown;
/** Injectable timer so the daily schedule is testable without real delays. */
export interface TimerLike {
    setTimeout(callback: () => void, ms: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
}
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
/**
 * Reconcile every user once. Per-user failures are isolated so one unreadable
 * user never aborts the whole run. No balance is ever mutated: mismatches are
 * only flagged and alerted (Req 7.4). Incomplete comparisons alert and are
 * returned for retry on the next run (Req 7.5).
 */
export declare function runLedgerReconciliationOnce(store: LedgerReconciliationStore, alertHook: ReconciliationAlertHook, options?: RunOnceOptions): Promise<ReconciliationRunResult>;
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
export declare function startLedgerReconciliation(deps: LedgerReconciliationDeps): LedgerReconciliationHandle;
