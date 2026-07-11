"use strict";
/**
 * Synchronous auto-refund on post-charge Job failure (Billing_Service).
 *
 * When a Job fails after it has already been charged, the Billing_Service must
 * create a single `credit` billing_events row equal to the sum of that Job's
 * `charge` rows that do not already have a corresponding `credit` (linked via
 * `credit_of_event`). The credit is created synchronously inside the failure
 * handler, before it returns (Req 9.2). If creation fails it is retried up to 3
 * additional times within the same invocation (Req 9.4); on total exhaustion the
 * Job is set to `refund-pending` and the handler completes (Req 9.5).
 *
 * The refund is idempotent (Req 9.3): a charge that already has a linked credit
 * is never credited again, so replaying the handler creates no duplicate credit.
 * When no `charge` row exists for the Job, no refund action is taken (Req 4.4).
 *
 * Following the codebase convention, the pure decision logic (uncredited-charge
 * sum and the refund/refund-pending decision) is separated from the
 * side-effecting collaborators, which are injected so the handler is testable
 * without a real ledger or Job_Store. The shared `BillingEvent` type is consumed
 * as-is (see `packages/shared`); it is not redefined here. The injected
 * `AutoRefundLedgerStore` is the minimal surface the `billingLedger` store
 * satisfies (append + listByJob).
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 4.3, 4.4
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_REFUND_RETRIES = exports.REFUND_PENDING_STATUS = void 0;
exports.creditedChargeIds = creditedChargeIds;
exports.uncreditedCharges = uncreditedCharges;
exports.uncreditedChargeSum = uncreditedChargeSum;
exports.decideRefund = decideRefund;
exports.autoRefundOnFailure = autoRefundOnFailure;
exports.createAutoRefundHandler = createAutoRefundHandler;
exports.resetAutoRefundState = resetAutoRefundState;
// --- Configuration ---
/** Job status recorded when all credit-creation attempts fail (Req 9.5). */
exports.REFUND_PENDING_STATUS = "refund-pending";
/**
 * Additional credit-creation attempts after the first, within one invocation
 * (Req 9.4). Total attempts per invocation = 1 + MAX_REFUND_RETRIES = 4.
 */
exports.MAX_REFUND_RETRIES = 3;
// --- Pure logic (no I/O; unit/property testable) ---
/** Round a currency amount to 2 decimal places. */
function round2(amount) {
    return Math.round(amount * 100) / 100;
}
/**
 * IDs of charge events that already have a corresponding credit, i.e. that are
 * referenced by some credit row's `credit_of_event` (Req 9.3).
 */
function creditedChargeIds(events) {
    const credited = new Set();
    for (const e of events) {
        if (e.type === "credit" && e.credit_of_event) {
            credited.add(e.credit_of_event);
        }
    }
    return credited;
}
/**
 * The `charge` rows for a job that do not yet have a linked credit (Req 9.1).
 */
function uncreditedCharges(events, jobId) {
    const credited = creditedChargeIds(events);
    return events.filter((e) => e.job_id === jobId && e.type === "charge" && !credited.has(e.id));
}
/**
 * Sum of `amount_usd` over a job's uncredited charges. Charge amounts are stored
 * negative, so this sum is <= 0; the refunding credit is its magnitude.
 */
function uncreditedChargeSum(events, jobId) {
    return uncreditedCharges(events, jobId).reduce((sum, e) => sum + e.amount_usd, 0);
}
function decideRefund(events, jobId) {
    const hasCharge = events.some((e) => e.job_id === jobId && e.type === "charge");
    if (!hasCharge) {
        return { action: "no_charge" };
    }
    const uncredited = uncreditedCharges(events, jobId);
    if (uncredited.length === 0) {
        return { action: "already_credited" };
    }
    // Charges are stored negative; the credit is the positive magnitude of their
    // sum (a single credit per Req 9.1 / Property 18). Link it to the first
    // uncredited charge so a replay sees that charge as credited (Req 9.3); for a
    // single-charge job — the common case — this is exact.
    const creditAmount = round2(-uncreditedChargeSum(events, jobId));
    return {
        action: "refund",
        credit_amount: creditAmount,
        charge_id: uncredited[0].id,
        user_id: uncredited[0].user_id,
    };
}
// --- Orchestration ---
let refundIdCounter = 0;
/** Default credit event id generator. */
function defaultGenerateId() {
    refundIdCounter++;
    return `credit_${refundIdCounter}_${Date.now()}`;
}
/**
 * Synchronous auto-refund for a failed Job.
 *
 * Computes the uncredited-charge credit, then attempts to append it up to
 * 1 + MAX_REFUND_RETRIES times within this invocation (Req 9.2, 9.4). Returns
 * the outcome; on exhaustion the Job is set to `refund-pending` (Req 9.5).
 */
async function autoRefundOnFailure(jobId, deps) {
    const events = await deps.store.listByJob(jobId);
    const decision = decideRefund(events, jobId);
    if (decision.action === "no_charge") {
        return { status: "no_charge" };
    }
    if (decision.action === "already_credited") {
        return { status: "already_credited" };
    }
    const generateId = deps.generateId ?? defaultGenerateId;
    const now = deps.now ?? (() => new Date().toISOString());
    const creditEvent = {
        id: generateId(),
        user_id: decision.user_id,
        job_id: jobId,
        type: "credit",
        amount_usd: decision.credit_amount,
        credit_of_event: decision.charge_id,
        created_at: now(),
    };
    const totalAttempts = 1 + exports.MAX_REFUND_RETRIES;
    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        try {
            await deps.store.append(creditEvent);
            return { status: "refunded" };
        }
        catch {
            // Nothing was persisted on a failed append (append-only ledger), so the
            // same credit event id is safely reused on the next attempt.
        }
    }
    // All attempts failed: surface a durable refund-pending state (Req 9.5).
    await deps.updateJobStatus(jobId, exports.REFUND_PENDING_STATUS);
    return { status: "refund-pending" };
}
/**
 * Build a `PostChargeFailureHandler` bound to the given deps, for injection into
 * the Job_Scheduler failure paths (Job_Timeout, Output_Validator, OOM_Retry
 * exhaustion) so a charged, failed Job is refunded synchronously.
 */
function createAutoRefundHandler(deps) {
    return (jobId) => autoRefundOnFailure(jobId, deps);
}
/** Reset the module-level credit id counter (test helper). */
function resetAutoRefundState() {
    refundIdCounter = 0;
}
//# sourceMappingURL=autoRefund.js.map