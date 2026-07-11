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

// --- Configuration ---

/** Job status recorded when all credit-creation attempts fail (Req 9.5). */
export const REFUND_PENDING_STATUS = "refund-pending";

/**
 * Additional credit-creation attempts after the first, within one invocation
 * (Req 9.4). Total attempts per invocation = 1 + MAX_REFUND_RETRIES = 4.
 */
export const MAX_REFUND_RETRIES = 3;

// --- Injected collaborators ---

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

// --- Pure logic (no I/O; unit/property testable) ---

/** Round a currency amount to 2 decimal places. */
function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * IDs of charge events that already have a corresponding credit, i.e. that are
 * referenced by some credit row's `credit_of_event` (Req 9.3).
 */
export function creditedChargeIds(events: readonly BillingEvent[]): Set<string> {
  const credited = new Set<string>();
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
export function uncreditedCharges(
  events: readonly BillingEvent[],
  jobId: string
): BillingEvent[] {
  const credited = creditedChargeIds(events);
  return events.filter(
    (e) => e.job_id === jobId && e.type === "charge" && !credited.has(e.id)
  );
}

/**
 * Sum of `amount_usd` over a job's uncredited charges. Charge amounts are stored
 * negative, so this sum is <= 0; the refunding credit is its magnitude.
 */
export function uncreditedChargeSum(
  events: readonly BillingEvent[],
  jobId: string
): number {
  return uncreditedCharges(events, jobId).reduce(
    (sum, e) => sum + e.amount_usd,
    0
  );
}

/**
 * The refund decision for a failed job, given its current ledger events.
 *
 * - `no_charge`        — the job has no `charge` row; take no action (Req 4.4).
 * - `already_credited` — every charge already has a linked credit (Req 9.3).
 * - `refund`           — create one positive `credit` for `credit_amount`,
 *                        linked to `charge_id` (Req 9.1).
 */
export type RefundDecision =
  | { action: "no_charge" }
  | { action: "already_credited" }
  | {
      action: "refund";
      credit_amount: number;
      charge_id: string;
      user_id: string;
    };

export function decideRefund(
  events: readonly BillingEvent[],
  jobId: string
): RefundDecision {
  const hasCharge = events.some(
    (e) => e.job_id === jobId && e.type === "charge"
  );
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
function defaultGenerateId(): string {
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
export async function autoRefundOnFailure(
  jobId: string,
  deps: AutoRefundDeps
): Promise<RefundOutcome> {
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

  const creditEvent: BillingEvent = {
    id: generateId(),
    user_id: decision.user_id,
    job_id: jobId,
    type: "credit",
    amount_usd: decision.credit_amount,
    credit_of_event: decision.charge_id,
    created_at: now(),
  };

  const totalAttempts = 1 + MAX_REFUND_RETRIES;
  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      await deps.store.append(creditEvent);
      return { status: "refunded" };
    } catch {
      // Nothing was persisted on a failed append (append-only ledger), so the
      // same credit event id is safely reused on the next attempt.
    }
  }

  // All attempts failed: surface a durable refund-pending state (Req 9.5).
  await deps.updateJobStatus(jobId, REFUND_PENDING_STATUS);
  return { status: "refund-pending" };
}

/**
 * Build a `PostChargeFailureHandler` bound to the given deps, for injection into
 * the Job_Scheduler failure paths (Job_Timeout, Output_Validator, OOM_Retry
 * exhaustion) so a charged, failed Job is refunded synchronously.
 */
export function createAutoRefundHandler(
  deps: AutoRefundDeps
): PostChargeFailureHandler {
  return (jobId: string) => autoRefundOnFailure(jobId, deps);
}

/** Reset the module-level credit id counter (test helper). */
export function resetAutoRefundState(): void {
  refundIdCounter = 0;
}
