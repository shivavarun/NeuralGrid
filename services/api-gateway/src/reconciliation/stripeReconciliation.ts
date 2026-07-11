/**
 * Stripe Reconciliation_Job (Billing_Service, Stripe cadence).
 *
 * Runs every 15 minutes and compares Stripe's `charge`/`topup` records from the
 * trailing 24 hours against the `billing_events` ledger. Stripe records younger
 * than 5 minutes are excluded to avoid flagging in-flight webhook delivery lag.
 *
 * Findings:
 *   - A record present on exactly one side (Stripe or ledger) with no
 *     counterpart on the other is an *orphan*.
 *   - A matched pair whose amounts differ by more than $0.01 is a *mismatch*.
 *
 * When Stripe is unreachable, an admin alert fires and the run is retried on the
 * next scheduled tick (no state is mutated). Any mismatch/orphan pages on-call
 * via the injected alert hook (Req 19.3).
 *
 * The pure orphan/mismatch detection (`reconcileStripe`) is separated from all
 * I/O so it is testable without a real Stripe or ledger. Both the Stripe client
 * and the ledger are injected as interfaces; the ledger interface is a minimal
 * read surface satisfiable by the shared `BillingLedgerStore` (task 9.1).
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */

import type { BillingEvent } from "@neuralgrid/shared";

// --- Constants ---

/** Reconciliation cadence: every 15 minutes. */
export const STRIPE_RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000;

/** Records younger than this are excluded (webhook delivery lag guard). */
export const STRIPE_RECORD_MIN_AGE_MS = 5 * 60 * 1000;

/** Trailing comparison window. */
export const STRIPE_RECONCILIATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Amounts differing by strictly more than this are a mismatch. */
export const AMOUNT_TOLERANCE_USD = 0.01;

// --- Record shapes ---

/**
 * A Stripe-side billing record relevant to reconciliation. Only `charge` and
 * `topup` records participate. `amount_usd` is the positive charged/credited
 * magnitude as Stripe reports it. `created_at_ms` is a ms epoch.
 */
export interface StripeRecord {
  stripe_id: string;
  type: "charge" | "topup";
  amount_usd: number;
  created_at_ms: number;
}

/** A ledger row normalized for reconciliation (from a `BillingEvent`). */
export interface LedgerRecord {
  /** The Stripe id this ledger row is linked to (`reconciled_stripe_id`). */
  stripe_id: string;
  type: "charge" | "topup";
  /** Magnitude in USD (absolute value; ledger `charge` amounts are negative). */
  amount_usd: number;
  created_at_ms: number;
  /** The originating ledger event id, for alerting. */
  event_id: string;
}

// --- Findings ---

export interface Orphan {
  side: "stripe" | "ledger";
  stripe_id: string;
  type: "charge" | "topup";
  amount_usd: number;
}

export interface Mismatch {
  stripe_id: string;
  type: "charge" | "topup";
  stripe_amount_usd: number;
  ledger_amount_usd: number;
  delta_usd: number;
}

export interface ReconciliationResult {
  orphans: Orphan[];
  mismatches: Mismatch[];
}

// --- Injectable dependencies ---

/**
 * Injectable Stripe client for reconciliation. Lists `charge`/`topup` records
 * created within the given ms-epoch window. MUST reject (throw) when the Stripe
 * API is unreachable so the caller can alert and retry next run.
 */
export interface ReconciliationStripeClient {
  listRecords(sinceMs: number, untilMs: number): Promise<StripeRecord[]>;
}

/**
 * Minimal ledger read surface consumed by reconciliation. Returns the Stripe-
 * linked `charge`/`topup` billing_events created within the window. Satisfiable
 * by the shared `BillingLedgerStore` (task 9.1); depends only on the shared
 * `BillingEvent` type.
 */
export interface ReconciliationLedgerStore {
  listStripeLinkedEvents(
    sinceMs: number,
    untilMs: number
  ): Promise<BillingEvent[]>;
}

export interface ReconciliationAlert {
  kind: "billing_mismatch";
  reason: "orphan" | "mismatch" | "stripe_unreachable";
  detail: string;
  raised_at: number;
}

/** Injected admin-alert hook; the concrete Notification_Service is the caller's. */
export type ReconciliationAlertHook = (
  alert: ReconciliationAlert
) => void | Promise<void>;

// --- Normalization helpers ---

function parseMs(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Project a `charge`/`topup` `BillingEvent` linked to a Stripe id into a
 * `LedgerRecord`. Returns `null` for events that don't participate in Stripe
 * reconciliation (non charge/topup, or without a `reconciled_stripe_id`).
 */
export function toLedgerRecord(event: BillingEvent): LedgerRecord | null {
  if (event.type !== "charge" && event.type !== "topup") return null;
  if (!event.reconciled_stripe_id) return null;
  return {
    stripe_id: event.reconciled_stripe_id,
    type: event.type,
    amount_usd: Math.abs(event.amount_usd),
    created_at_ms: parseMs(event.created_at),
    event_id: event.id,
  };
}

/** True when a record is old enough and recent enough to be reconciled. */
export function isEligible(
  createdAtMs: number,
  now: number,
  minAgeMs: number = STRIPE_RECORD_MIN_AGE_MS,
  windowMs: number = STRIPE_RECONCILIATION_WINDOW_MS
): boolean {
  const age = now - createdAtMs;
  return age >= minAgeMs && age <= windowMs;
}

// --- Pure detection logic (no I/O) ---

/**
 * Compare eligible Stripe and ledger records, producing orphans and mismatches.
 *
 * Callers should pass records that have already been filtered by `isEligible`;
 * this function does no windowing itself so it stays deterministic and testable.
 * Matching is by `stripe_id`. Amounts are compared as magnitudes; a difference
 * strictly greater than the tolerance is a mismatch.
 */
export function reconcileStripe(
  stripeRecords: StripeRecord[],
  ledgerRecords: LedgerRecord[],
  tolerance: number = AMOUNT_TOLERANCE_USD
): ReconciliationResult {
  const orphans: Orphan[] = [];
  const mismatches: Mismatch[] = [];

  const ledgerById = new Map<string, LedgerRecord>();
  for (const l of ledgerRecords) ledgerById.set(l.stripe_id, l);

  const stripeById = new Map<string, StripeRecord>();
  for (const s of stripeRecords) stripeById.set(s.stripe_id, s);

  // Stripe records: orphan if no ledger counterpart; else check amount delta.
  for (const s of stripeRecords) {
    const l = ledgerById.get(s.stripe_id);
    if (!l) {
      orphans.push({
        side: "stripe",
        stripe_id: s.stripe_id,
        type: s.type,
        amount_usd: s.amount_usd,
      });
      continue;
    }
    const delta = Math.abs(s.amount_usd - l.amount_usd);
    if (delta > tolerance) {
      mismatches.push({
        stripe_id: s.stripe_id,
        type: s.type,
        stripe_amount_usd: s.amount_usd,
        ledger_amount_usd: l.amount_usd,
        delta_usd: delta,
      });
    }
  }

  // Ledger rows with no Stripe counterpart are orphans on the ledger side.
  for (const l of ledgerRecords) {
    if (!stripeById.has(l.stripe_id)) {
      orphans.push({
        side: "ledger",
        stripe_id: l.stripe_id,
        type: l.type,
        amount_usd: l.amount_usd,
      });
    }
  }

  return { orphans, mismatches };
}

// --- Orchestration ---

export interface RunOptions {
  stripe: ReconciliationStripeClient;
  ledger: ReconciliationLedgerStore;
  alertHook?: ReconciliationAlertHook;
  now?: number;
}

export interface RunOutcome {
  /** True when the run completed a full comparison. */
  completed: boolean;
  /** True when the run should be retried next tick (e.g. Stripe unreachable). */
  retry: boolean;
  result?: ReconciliationResult;
}

/**
 * Execute one reconciliation pass. Fetches both sides for the trailing 24h,
 * excludes records younger than 5 minutes, runs pure detection, and raises an
 * admin alert per finding. If Stripe is unreachable, alerts and requests a retry
 * next run without mutating any state.
 */
export async function runStripeReconciliation(
  options: RunOptions
): Promise<RunOutcome> {
  const now = options.now ?? Date.now();
  const sinceMs = now - STRIPE_RECONCILIATION_WINDOW_MS;

  let stripeRecords: StripeRecord[];
  try {
    stripeRecords = await options.stripe.listRecords(sinceMs, now);
  } catch (err) {
    await options.alertHook?.({
      kind: "billing_mismatch",
      reason: "stripe_unreachable",
      detail: `Stripe API unreachable during reconciliation run: ${
        err instanceof Error ? err.message : String(err)
      }`,
      raised_at: now,
    });
    return { completed: false, retry: true };
  }

  const events = await options.ledger.listStripeLinkedEvents(sinceMs, now);
  const ledgerRecords = events
    .map(toLedgerRecord)
    .filter((r): r is LedgerRecord => r !== null);

  const eligibleStripe = stripeRecords.filter((r) =>
    isEligible(r.created_at_ms, now)
  );
  const eligibleLedger = ledgerRecords.filter((r) =>
    isEligible(r.created_at_ms, now)
  );

  const result = reconcileStripe(eligibleStripe, eligibleLedger);

  for (const o of result.orphans) {
    await options.alertHook?.({
      kind: "billing_mismatch",
      reason: "orphan",
      detail: `Orphan ${o.type} on ${o.side} side: stripe_id=${o.stripe_id} amount=$${o.amount_usd.toFixed(
        2
      )}`,
      raised_at: now,
    });
  }
  for (const m of result.mismatches) {
    await options.alertHook?.({
      kind: "billing_mismatch",
      reason: "mismatch",
      detail: `Amount mismatch for ${m.type} stripe_id=${m.stripe_id}: stripe=$${m.stripe_amount_usd.toFixed(
        2
      )} ledger=$${m.ledger_amount_usd.toFixed(2)} delta=$${m.delta_usd.toFixed(2)}`,
      raised_at: now,
    });
  }

  return { completed: true, retry: false, result };
}

/**
 * Start the recurring 15-minute reconciliation loop. Returns a stop function
 * that clears the interval. Errors from a single run never crash the loop; a
 * failed run simply retries on the next tick.
 */
export function startStripeReconciliation(
  options: Omit<RunOptions, "now">
): () => void {
  const timer = setInterval(() => {
    void runStripeReconciliation(options).catch(() => {
      /* individual run failures are handled/alerted inside runStripeReconciliation */
    });
  }, STRIPE_RECONCILIATION_INTERVAL_MS);

  // Do not keep the process alive solely for this timer.
  if (typeof timer.unref === "function") timer.unref();

  return () => clearInterval(timer);
}
