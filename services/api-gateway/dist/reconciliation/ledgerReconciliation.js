"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RECONCILE_MINUTE_UTC = exports.DEFAULT_RECONCILE_HOUR_UTC = exports.RECONCILE_INTERVAL_MS = exports.RECONCILE_TOLERANCE_USD = void 0;
exports.computeBalance = computeBalance;
exports.evaluateBalance = evaluateBalance;
exports.isBalanceMismatch = isBalanceMismatch;
exports.msUntilNextRun = msUntilNextRun;
exports.runLedgerReconciliationOnce = runLedgerReconciliationOnce;
exports.startLedgerReconciliation = startLedgerReconciliation;
// --- Configuration ---
/** Absolute balance difference at or below this (USD) is within tolerance. */
exports.RECONCILE_TOLERANCE_USD = 0.01;
/** Fixed cadence: the ledger reconciliation runs once per 24 hours. */
exports.RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Default fixed time-of-day (UTC) at which the daily run fires. */
exports.DEFAULT_RECONCILE_HOUR_UTC = 0;
exports.DEFAULT_RECONCILE_MINUTE_UTC = 0;
// --- Pure decision logic (no I/O; unit/property testable) ---
/**
 * Balance as the sum of a user's billing-event amounts. `amount_usd` is negative
 * for `charge` and positive for `credit`/`topup`/`refund`, so a plain sum yields
 * the balance (design Req 7.2). Mirrors the ledger's `computeBalance`; swap for
 * the shared one from `billingLedger.ts` (task 9.1) when available.
 */
function computeBalance(events) {
    return events.reduce((sum, e) => sum + e.amount_usd, 0);
}
/**
 * Compare a computed balance against a cached balance. A mismatch is flagged if
 * and only if the absolute difference strictly exceeds the tolerance; a
 * difference exactly at the tolerance is treated as reconciled.
 */
function evaluateBalance(computedBalance, cachedBalance, tolerance = exports.RECONCILE_TOLERANCE_USD) {
    const difference = computedBalance - cachedBalance;
    return {
        computed_balance: computedBalance,
        cached_balance: cachedBalance,
        difference,
        mismatch: Math.abs(difference) > tolerance,
    };
}
/** Convenience predicate for the tolerance comparison. */
function isBalanceMismatch(computedBalance, cachedBalance, tolerance = exports.RECONCILE_TOLERANCE_USD) {
    return Math.abs(computedBalance - cachedBalance) > tolerance;
}
/**
 * Milliseconds from `now` until the next occurrence of the fixed UTC time-of-day.
 * Always returns a value in `(0, 24h]` so a run scheduled exactly at the target
 * time waits a full day rather than firing immediately.
 */
function msUntilNextRun(now, hourUtc = exports.DEFAULT_RECONCILE_HOUR_UTC, minuteUtc = exports.DEFAULT_RECONCILE_MINUTE_UTC) {
    const d = new Date(now);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hourUtc, minuteUtc, 0, 0);
    const delta = next - now;
    return delta > 0 ? delta : delta + exports.RECONCILE_INTERVAL_MS;
}
const defaultTimer = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (h) => clearTimeout(h),
};
// --- Single reconciliation pass ---
/**
 * Reconcile every user once. Per-user failures are isolated so one unreadable
 * user never aborts the whole run. No balance is ever mutated: mismatches are
 * only flagged and alerted (Req 7.4). Incomplete comparisons alert and are
 * returned for retry on the next run (Req 7.5).
 */
async function runLedgerReconciliationOnce(store, alertHook, options = {}) {
    const now = options.now ?? Date.now();
    const userIds = new Set();
    try {
        for (const id of await store.listUserIds())
            userIds.add(id);
    }
    catch (err) {
        // If the user roster itself is unreadable there is nothing to iterate;
        // still fold in any carried-over users below so they are not lost.
        void err;
    }
    if (options.carryOver) {
        for (const id of options.carryOver)
            userIds.add(id);
    }
    const mismatches = [];
    const incomplete = [];
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
        }
        catch (err) {
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
/**
 * Start the daily ledger reconciliation. The first pass fires at the next
 * occurrence of the fixed UTC time-of-day, then every 24h thereafter. Users
 * whose comparison was incomplete are carried into the following run for retry.
 */
function startLedgerReconciliation(deps) {
    const now = deps.now ?? (() => Date.now());
    const timer = deps.timer ?? defaultTimer;
    const hourUtc = deps.hourUtc ?? exports.DEFAULT_RECONCILE_HOUR_UTC;
    const minuteUtc = deps.minuteUtc ?? exports.DEFAULT_RECONCILE_MINUTE_UTC;
    let handle;
    let stopped = false;
    let carryOver = [];
    const runAndReschedule = async () => {
        if (stopped)
            return;
        let result;
        try {
            result = await runLedgerReconciliationOnce(deps.store, deps.alertHook, {
                carryOver,
                now: now(),
            });
            carryOver = result.incomplete;
            deps.onRun?.(result);
        }
        finally {
            // Always reschedule so a transient failure never kills the cadence.
            scheduleNext(exports.RECONCILE_INTERVAL_MS);
        }
    };
    const scheduleNext = (delayMs) => {
        if (stopped)
            return;
        handle = timer.setTimeout(() => {
            void runAndReschedule();
        }, delayMs);
    };
    scheduleNext(msUntilNextRun(now(), hourUtc, minuteUtc));
    return {
        stop() {
            stopped = true;
            if (handle !== undefined)
                timer.clearTimeout(handle);
        },
    };
}
//# sourceMappingURL=ledgerReconciliation.js.map