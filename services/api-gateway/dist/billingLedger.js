"use strict";
/**
 * Billing_Events ledger and margin line items (production readiness).
 *
 * This is the new append-only `billing_events` ledger that layers real-money
 * billing correctness onto the shipped MVP. It lives ALONGSIDE the existing
 * `billing.ts` (Stripe charge recording); it does not replace it.
 *
 * What this module owns:
 *  - The append-only ledger of `charge`/`credit`/`topup`/`refund` rows, with the
 *    sign convention `amount_usd < 0` for a `charge` and `> 0` otherwise.
 *  - Balance-as-sum: a user's balance is exactly the sum of their events'
 *    `amount_usd` (Req 7.2).
 *  - Margin line items at charge time: `provider_cost_usd` and `margin_usd` are
 *    persisted as distinct fields (2 dp each). If they don't sum to the total
 *    charged within $0.01, the charge is flagged `charge_consistent = false` and
 *    the recorded lines are preserved unmodified (Req 10.1, 10.2, 10.3).
 *
 * Design shape (reused by tasks 10.1 auto-refund and 11.x reconciliation):
 *  - `BillingLedgerStore` is an injectable, async, DB-ready interface. The MVP
 *    ships an in-memory implementation; a PostgreSQL-backed implementation can
 *    be dropped in behind the same interface without touching callers.
 *  - `computeBalance` and `checkMarginConsistent` are pure functions (no I/O),
 *    so they are trivially unit- and property-testable.
 *
 * DB mapping note: migration 002's `billing_events` table names the owner column
 * `developer_id` (and `job_id` is a VARCHAR). At the type level we keep the
 * shared `BillingEvent.user_id` field as the canonical owner id; `user_id` here
 * IS the developer id. The `LedgerEvent` type adds the two ledger-only columns
 * (`charge_consistent`, `credit_of_event`) that migration 002 defines but the
 * shared `BillingEvent` interface does not yet carry.
 *
 * Requirements: 7.1, 7.2, 10.1, 10.2, 10.3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryBillingLedgerStore = exports.LEDGER_TOLERANCE_USD = void 0;
exports.roundUsd = roundUsd;
exports.isDebit = isDebit;
exports.signedAmount = signedAmount;
exports.computeBalance = computeBalance;
exports.checkMarginConsistent = checkMarginConsistent;
exports.generateLedgerEventId = generateLedgerEventId;
exports.createInMemoryLedgerStore = createInMemoryLedgerStore;
exports.recordCharge = recordCharge;
exports.recordCredit = recordCredit;
exports.getBalance = getBalance;
exports.getMarginDetail = getMarginDetail;
// --- Tolerances ---
/** Line-item / balance reconciliation tolerance (Req 10.2, 7.3). */
exports.LEDGER_TOLERANCE_USD = 0.01;
// --- Pure helpers (no I/O) ---
/** Round a USD amount to 2 decimal places (banker-free half-up on cents). */
function roundUsd(amount) {
    return Math.round(amount * 100) / 100;
}
/** True for `charge`; those rows carry a negative `amount_usd`. */
function isDebit(type) {
    return type === "charge";
}
/**
 * Apply the ledger sign convention to a magnitude:
 *  - `charge`  -> negative
 *  - `credit` / `topup` / `refund` -> positive
 *
 * The input is treated as a magnitude; its incoming sign is ignored so callers
 * can pass a natural positive amount for any event type.
 */
function signedAmount(type, magnitudeUsd) {
    const magnitude = Math.abs(roundUsd(magnitudeUsd));
    return isDebit(type) ? -magnitude : magnitude;
}
/**
 * Balance-as-sum (Req 7.2): a user's balance is the sum of their events'
 * `amount_usd`. Summed in integer cents to avoid floating-point drift, then
 * returned as a 2-dp dollar amount.
 */
function computeBalance(events) {
    const cents = events.reduce((acc, e) => acc + Math.round(e.amount_usd * 100), 0);
    return cents / 100;
}
/**
 * Compute the two charge line items and whether they reconcile with the total.
 *
 * Each line is rounded to 2 dp. `charge_consistent` is true iff the two rounded
 * lines sum to the (absolute) total charged within `LEDGER_TOLERANCE_USD`. The
 * line values are returned as-rounded and are NEVER adjusted to force a match —
 * an inconsistent charge preserves its original lines and is simply flagged.
 */
function checkMarginConsistent(providerCostUsd, marginUsd, totalChargedUsd) {
    const provider_cost_usd = roundUsd(providerCostUsd);
    const margin_usd = roundUsd(marginUsd);
    const total = Math.abs(roundUsd(totalChargedUsd));
    const lineSum = roundUsd(provider_cost_usd + margin_usd);
    const charge_consistent = Math.abs(lineSum - total) <= exports.LEDGER_TOLERANCE_USD;
    return { provider_cost_usd, margin_usd, charge_consistent };
}
// --- ID generation ---
let ledgerIdCounter = 0;
function generateLedgerEventId() {
    ledgerIdCounter++;
    return `be_${ledgerIdCounter}_${Date.now()}`;
}
// --- In-memory store implementation (MVP) ---
/**
 * In-memory, append-only ledger store. Enforces append semantics by only ever
 * pushing; there is deliberately no update or delete surface.
 */
class InMemoryBillingLedgerStore {
    constructor() {
        this.events = [];
    }
    async append(event) {
        // Defensive copy so callers can't mutate a stored row after the fact.
        const stored = { ...event };
        this.events.push(stored);
        return { ...stored };
    }
    async listByDeveloper(developerId) {
        return this.events
            .filter((e) => e.user_id === developerId)
            .map((e) => ({ ...e }));
    }
    async listByJob(jobId) {
        return this.events
            .filter((e) => e.job_id === jobId)
            .map((e) => ({ ...e }));
    }
    /** All events (any developer), append order. Test/inspection helper. */
    async listAll() {
        return this.events.map((e) => ({ ...e }));
    }
    /** Clear all state. Test helper only. */
    reset() {
        this.events.length = 0;
    }
}
exports.InMemoryBillingLedgerStore = InMemoryBillingLedgerStore;
/** Convenience factory for the default (in-memory) store. */
function createInMemoryLedgerStore() {
    return new InMemoryBillingLedgerStore();
}
/**
 * Record a `charge` row with its margin line items (Req 10.1–10.3).
 *
 * `amount_usd` is stored negative. `provider_cost_usd` and `margin_usd` are each
 * stored to 2 dp. If they don't sum to the total within $0.01, the row is
 * flagged `charge_consistent = false` with both lines preserved unmodified.
 */
async function recordCharge(store, input) {
    const { provider_cost_usd, margin_usd, charge_consistent } = checkMarginConsistent(input.providerCostUsd, input.marginUsd, input.totalUsd);
    const event = {
        id: generateLedgerEventId(),
        user_id: input.developerId,
        job_id: input.jobId,
        type: "charge",
        amount_usd: signedAmount("charge", input.totalUsd),
        provider_cost_usd,
        margin_usd,
        charge_consistent,
        reconciled_stripe_id: input.reconciledStripeId,
        created_at: new Date().toISOString(),
    };
    return store.append(event);
}
/**
 * Record a positive-amount row (`credit`, `topup`, or `refund`). Charges must go
 * through {@link recordCharge}; passing `charge` here is rejected.
 */
async function recordCredit(store, type, input) {
    const event = {
        id: generateLedgerEventId(),
        user_id: input.developerId,
        job_id: input.jobId,
        type,
        amount_usd: signedAmount(type, input.amountUsd),
        credit_of_event: input.creditOfEvent,
        reconciled_stripe_id: input.reconciledStripeId,
        created_at: new Date().toISOString(),
    };
    return store.append(event);
}
// --- Balance convenience ---
/** Fetch a developer's events and compute their balance-as-sum. */
async function getBalance(store, developerId) {
    const events = await store.listByDeveloper(developerId);
    return computeBalance(events);
}
/**
 * Return a charged Job's stored `provider_cost_usd`/`margin_usd` directly, with
 * no recomputation (Req 10.4). Reads the Job's `charge` row from the ledger and
 * echoes its persisted line items. Returns `undefined` when the Job has no
 * `charge` row (nothing has been charged to report on).
 *
 * If a Job somehow has more than one `charge` row, the first (earliest-appended)
 * is used; each row already carries its own persisted lines, so no aggregation
 * or recomputation is performed.
 */
async function getMarginDetail(store, jobId) {
    const events = await store.listByJob(jobId);
    const charge = events.find((e) => e.type === "charge");
    if (!charge) {
        return undefined;
    }
    return {
        job_id: jobId,
        developer_id: charge.user_id,
        // Echo stored values verbatim; do NOT recompute (Req 10.4). Fall back to 0
        // only if a legacy row never persisted a line (defensive, not a compute).
        provider_cost_usd: charge.provider_cost_usd ?? 0,
        margin_usd: charge.margin_usd ?? 0,
        total_charged_usd: Math.abs(charge.amount_usd),
        charge_consistent: charge.charge_consistent ?? false,
        charge_event_id: charge.id,
    };
}
//# sourceMappingURL=billingLedger.js.map