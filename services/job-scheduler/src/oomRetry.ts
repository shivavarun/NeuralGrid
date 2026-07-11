/**
 * OOM_Retry: auto-retry a job at a higher tier after a provider-reported
 * out-of-memory event.
 *
 * When a provider node reports OOM for a job below tier T3 whose cumulative
 * OOM count is under the cap (2), the scheduler redispatches the job at the
 * next tier in the fixed T1->T2->T3 ladder, increments the cumulative count,
 * and records an Estimator_Miss_Record with cause `OOM`. Once the count reaches
 * 2, or the job is already at T3, an OOM event fails the job terminally with
 * `OOM_RETRY_EXHAUSTED` and no further redispatch.
 *
 * The tier ladder (`nextTier`, T1->T2->T3, null at T3) is reused from
 * `softQueue.ts` rather than redefined. The pure decision logic
 * (`decideOomRetry`) is separated from the side-effecting orchestration so it
 * is unit/property testable without a dispatcher or Job_Store.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { ErrorCode } from "@neuralgrid/shared";
import type { Tier } from "@neuralgrid/shared";
import { nextTier } from "./softQueue";

/** Maximum cumulative OOM_Retry attempts for a single job (Req 6.2). */
export const MAX_OOM_RETRIES = 2;

/** Cause tag recorded on the Estimator_Miss_Record for an OOM_Retry (Req 6.5). */
export const OOM_MISS_CAUSE = "OOM" as const;

// --- Pure decision logic (no I/O; unit/property testable) ---

/**
 * Decision for a single OOM event given the job's current tier and its
 * cumulative OOM count *before* this event.
 *
 * - `retry`  — redispatch at `next_tier`; `oom_count` is the incremented count
 *   to persist (Req 6.1).
 * - `exhausted` — fail the job with `OOM_RETRY_EXHAUSTED`; either the job is
 *   already at T3 (Req 6.4) or the cap of 2 has been reached (Req 6.3).
 */
export type OomDecision =
  | { action: "retry"; next_tier: Tier; oom_count: number }
  | { action: "exhausted" };

/**
 * Decide how to handle an OOM event. A job at T3 can never be bumped and is
 * always exhausted regardless of count (Req 6.4). Otherwise, a count already at
 * or above the cap exhausts (Req 6.3); a count below the cap retries at the
 * next tier with the count incremented (Req 6.1, 6.2).
 */
export function decideOomRetry(
  currentTier: Tier,
  oomCount: number
): OomDecision {
  const bumped = nextTier(currentTier);

  // Already at the highest tier: no redispatch is possible (Req 6.4).
  if (bumped === null) {
    return { action: "exhausted" };
  }

  // Cap reached (Req 6.2, 6.3): a further OOM exhausts the job.
  if (oomCount >= MAX_OOM_RETRIES) {
    return { action: "exhausted" };
  }

  // Below the cap and below T3: bump one tier and increment the count (Req 6.1).
  return { action: "retry", next_tier: bumped, oom_count: oomCount + 1 };
}

// --- Orchestration ---

/** An out-of-memory event reported by a provider node for a running job. */
export interface OomEvent {
  job_id: string;
  /** The job's current (assigned) tier at the time of the OOM. */
  current_tier: Tier;
  /** The job's cumulative OOM_Retry count before this event. */
  oom_count: number;
}

export type OomRetryOutcome =
  | { status: "retried"; tier: Tier; oom_count: number }
  | { status: "exhausted"; error_code: ErrorCode.OOM_RETRY_EXHAUSTED };

/**
 * Side-effecting collaborators, injected so the OOM logic stays testable
 * without a real dispatcher, Job_Store, or estimator registry.
 */
export interface OomRetryDeps {
  /**
   * Redispatch a job at a higher tier and persist its incremented cumulative
   * OOM count (`jobs.oom_retry_count`).
   */
  redispatch(jobId: string, tier: Tier, oomCount: number): Promise<void>;
  /** Mark a job FAILED with a terminal error_code (Req 6.3, 6.4). */
  markFailed(jobId: string, errorCode: ErrorCode): Promise<void>;
  /** Persist an Estimator_Miss_Record for the job (Req 6.5). */
  recordEstimatorMiss(jobId: string, cause: typeof OOM_MISS_CAUSE): Promise<void>;
  /**
   * Post-charge failure hook (Req 9.1). Invoked after a job is failed with
   * OOM_RETRY_EXHAUSTED so the Billing_Service can synchronously refund a
   * charged job; a no-op for an uncharged job. Satisfied by the api-gateway
   * auto-refund handler (`createAutoRefundHandler`). Optional so a scheduler
   * without billing wiring is unaffected.
   */
  onPostChargeFailure?(jobId: string): Promise<unknown>;
}

/**
 * Handle a provider OOM event for a job.
 *
 * On a retry, an Estimator_Miss_Record (cause `OOM`) is recorded and the job is
 * redispatched at the next tier with its count incremented (Req 6.1, 6.5). On
 * exhaustion, the job is failed with `OOM_RETRY_EXHAUSTED` and no Estimator_Miss
 * is recorded and no redispatch is attempted (Req 6.3, 6.4).
 */
export async function handleOomEvent(
  event: OomEvent,
  deps: OomRetryDeps
): Promise<OomRetryOutcome> {
  const decision = decideOomRetry(event.current_tier, event.oom_count);

  if (decision.action === "exhausted") {
    await deps.markFailed(event.job_id, ErrorCode.OOM_RETRY_EXHAUSTED);
    // Synchronously refund iff the job was charged (Req 9.1).
    if (deps.onPostChargeFailure) {
      await deps.onPostChargeFailure(event.job_id);
    }
    return { status: "exhausted", error_code: ErrorCode.OOM_RETRY_EXHAUSTED };
  }

  // Record the estimator miss before redispatch so the miss is durable even if
  // the subsequent dispatch is deferred through the Soft_Queue (Req 6.5).
  await deps.recordEstimatorMiss(event.job_id, OOM_MISS_CAUSE);
  await deps.redispatch(event.job_id, decision.next_tier, decision.oom_count);

  return {
    status: "retried",
    tier: decision.next_tier,
    oom_count: decision.oom_count,
  };
}
