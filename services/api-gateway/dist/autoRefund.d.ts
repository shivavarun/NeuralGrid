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
import type { BillingEvent, RefundOutcome } from "@neuralgrid/shared";
/** Job status recorded when all credit-creation attempts fail (Req 9.5). */
export declare const REFUND_PENDING_STATUS = "refund-pending";
/**
 * Additional credit-creation attempts after the first, within one invocation
 * (Req 9.4). Total attempts per invocation = 1 + MAX_REFUND_RETRIES = 4.
 */
export declare const MAX_REFUND_RETRIES = 3;
/**
 * Minimal ledger surface the auto-refund handler needs. The `BillingLedgerStore`
 * from `billingLedger.ts` (task 9.1) satisfies this via its append + list
 * methods; this narrower interface keeps the handler independently testable and
 * avoids coupling to the full store contract.
 */
export interface AutoRefundLedgerStore {
    /** Append a new billing event to the append-only ledger. */
    append(event: BillingEvent): Promise<void>;
    /** All billing events recorded for a given job. */
    listByJob(jobId: string): Promise<BillingEvent[]>;
}
/** Set a Job's status (used to record `refund-pending` on exhaustion). */
export type JobStatusUpdater = (jobId: string, status: string) => Promise<void>;
/**
 * Side-effecting collaborators, injected for testability.
 * `generateId` and `now` default to real implementations.
 */
export interface AutoRefundDeps {
    store: AutoRefundLedgerStore;
    updateJobStatus: JobStatusUpdater;
    generateId?: () => string;
    now?: () => string;
}
/**
 * Post-charge failure hook shape. The Job_Scheduler failure paths (Job_Timeout,
 * Output_Validator, OOM_Retry exhaustion) invoke a function of this shape after
 * marking a Job FAILED so a charged Job is refunded synchronously.
 */
export type PostChargeFailureHandler = (jobId: string) => Promise<RefundOutcome>;
/**
 * IDs of charge events that already have a corresponding credit, i.e. that are
 * referenced by some credit row's `credit_of_event` (Req 9.3).
 */
export declare function creditedChargeIds(events: readonly BillingEvent[]): Set<string>;
/**
 * The `charge` rows for a job that do not yet have a linked credit (Req 9.1).
 */
export declare function uncreditedCharges(events: readonly BillingEvent[], jobId: string): BillingEvent[];
/**
 * Sum of `amount_usd` over a job's uncredited charges. Charge amounts are stored
 * negative, so this sum is <= 0; the refunding credit is its magnitude.
 */
export declare function uncreditedChargeSum(events: readonly BillingEvent[], jobId: string): number;
/**
 * The refund decision for a failed job, given its current ledger events.
 *
 * - `no_charge`        — the job has no `charge` row; take no action (Req 4.4).
 * - `already_credited` — every charge already has a linked credit (Req 9.3).
 * - `refund`           — create one positive `credit` for `credit_amount`,
 *                        linked to `charge_id` (Req 9.1).
 */
export type RefundDecision = {
    action: "no_charge";
} | {
    action: "already_credited";
} | {
    action: "refund";
    credit_amount: number;
    charge_id: string;
    user_id: string;
};
export declare function decideRefund(events: readonly BillingEvent[], jobId: string): RefundDecision;
/**
 * Synchronous auto-refund for a failed Job.
 *
 * Computes the uncredited-charge credit, then attempts to append it up to
 * 1 + MAX_REFUND_RETRIES times within this invocation (Req 9.2, 9.4). Returns
 * the outcome; on exhaustion the Job is set to `refund-pending` (Req 9.5).
 */
export declare function autoRefundOnFailure(jobId: string, deps: AutoRefundDeps): Promise<RefundOutcome>;
/**
 * Build a `PostChargeFailureHandler` bound to the given deps, for injection into
 * the Job_Scheduler failure paths (Job_Timeout, Output_Validator, OOM_Retry
 * exhaustion) so a charged, failed Job is refunded synchronously.
 */
export declare function createAutoRefundHandler(deps: AutoRefundDeps): PostChargeFailureHandler;
/** Reset the module-level credit id counter (test helper). */
export declare function resetAutoRefundState(): void;
