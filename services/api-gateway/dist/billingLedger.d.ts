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
import type { BillingEvent, BillingEventType, RefundOutcome } from "@neuralgrid/shared";
/** Line-item / balance reconciliation tolerance (Req 10.2, 7.3). */
export declare const LEDGER_TOLERANCE_USD = 0.01;
/**
 * A persisted `billing_events` row. Extends the shared `BillingEvent` with the
 * two ledger-only columns from migration 002:
 *  - `charge_consistent`: set on `charge` rows; `false` flags a margin mismatch.
 *  - `credit_of_event`: on a `credit`/`refund`, links back to the charge it
 *    offsets (used by auto-refund in task 10.1 and reconciliation in task 11.x).
 */
export interface LedgerEvent extends BillingEvent {
    /** Only meaningful on `charge` rows; `undefined` for non-charges. */
    charge_consistent?: boolean;
    /** Links an offsetting `credit`/`refund` back to its originating charge. */
    credit_of_event?: string;
}
/**
 * Append-only store for the `billing_events` ledger.
 *
 * Callers depend only on this interface. The in-memory implementation is used
 * for the MVP; a PostgreSQL-backed implementation (writing the migration-002
 * table, whose triggers reject UPDATE/DELETE) can be substituted unchanged.
 */
export interface BillingLedgerStore {
    /** Append one event to the ledger and return the persisted row. */
    append(event: LedgerEvent): Promise<LedgerEvent>;
    /** All ledger rows for a developer (owner), in append order. */
    listByDeveloper(developerId: string): Promise<LedgerEvent[]>;
    /**
     * All ledger rows for a given job, in append order. Used by margin-detail
     * retrieval (task 9.4) and auto-refund (task 10.1), both of which look up a
     * single Job's events.
     */
    listByJob(jobId: string): Promise<LedgerEvent[]>;
}
/** Round a USD amount to 2 decimal places (banker-free half-up on cents). */
export declare function roundUsd(amount: number): number;
/** True for `charge`; those rows carry a negative `amount_usd`. */
export declare function isDebit(type: BillingEventType): boolean;
/**
 * Apply the ledger sign convention to a magnitude:
 *  - `charge`  -> negative
 *  - `credit` / `topup` / `refund` -> positive
 *
 * The input is treated as a magnitude; its incoming sign is ignored so callers
 * can pass a natural positive amount for any event type.
 */
export declare function signedAmount(type: BillingEventType, magnitudeUsd: number): number;
/**
 * Balance-as-sum (Req 7.2): a user's balance is the sum of their events'
 * `amount_usd`. Summed in integer cents to avoid floating-point drift, then
 * returned as a 2-dp dollar amount.
 */
export declare function computeBalance(events: BillingEvent[]): number;
export interface MarginCheck {
    /** provider-cost line item, rounded to 2 dp. */
    provider_cost_usd: number;
    /** margin line item, rounded to 2 dp. */
    margin_usd: number;
    /** true iff provider_cost + margin == |total charged| within $0.01. */
    charge_consistent: boolean;
}
/**
 * Compute the two charge line items and whether they reconcile with the total.
 *
 * Each line is rounded to 2 dp. `charge_consistent` is true iff the two rounded
 * lines sum to the (absolute) total charged within `LEDGER_TOLERANCE_USD`. The
 * line values are returned as-rounded and are NEVER adjusted to force a match —
 * an inconsistent charge preserves its original lines and is simply flagged.
 */
export declare function checkMarginConsistent(providerCostUsd: number, marginUsd: number, totalChargedUsd: number): MarginCheck;
export declare function generateLedgerEventId(): string;
/**
 * In-memory, append-only ledger store. Enforces append semantics by only ever
 * pushing; there is deliberately no update or delete surface.
 */
export declare class InMemoryBillingLedgerStore implements BillingLedgerStore {
    private readonly events;
    append(event: LedgerEvent): Promise<LedgerEvent>;
    listByDeveloper(developerId: string): Promise<LedgerEvent[]>;
    listByJob(jobId: string): Promise<LedgerEvent[]>;
    /** All events (any developer), append order. Test/inspection helper. */
    listAll(): Promise<LedgerEvent[]>;
    /** Clear all state. Test helper only. */
    reset(): void;
}
/** Convenience factory for the default (in-memory) store. */
export declare function createInMemoryLedgerStore(): InMemoryBillingLedgerStore;
export interface RecordChargeInput {
    /** Owner (developer) id — persisted as `user_id` / DB `developer_id`. */
    developerId: string;
    jobId?: string;
    /** Total amount charged (magnitude, in USD); stored as a negative amount. */
    totalUsd: number;
    /** Provider cost line item (magnitude, USD). */
    providerCostUsd: number;
    /** NeuralGrid margin line item (magnitude, USD). */
    marginUsd: number;
    reconciledStripeId?: string;
}
/**
 * Record a `charge` row with its margin line items (Req 10.1–10.3).
 *
 * `amount_usd` is stored negative. `provider_cost_usd` and `margin_usd` are each
 * stored to 2 dp. If they don't sum to the total within $0.01, the row is
 * flagged `charge_consistent = false` with both lines preserved unmodified.
 */
export declare function recordCharge(store: BillingLedgerStore, input: RecordChargeInput): Promise<LedgerEvent>;
export interface RecordCreditInput {
    developerId: string;
    jobId?: string;
    /** Magnitude of the credit (USD); stored as a positive amount. */
    amountUsd: number;
    /** Links this credit/refund back to the charge it offsets. */
    creditOfEvent?: string;
    reconciledStripeId?: string;
}
/**
 * Record a positive-amount row (`credit`, `topup`, or `refund`). Charges must go
 * through {@link recordCharge}; passing `charge` here is rejected.
 */
export declare function recordCredit(store: BillingLedgerStore, type: Exclude<BillingEventType, "charge">, input: RecordCreditInput): Promise<LedgerEvent>;
/** Fetch a developer's events and compute their balance-as-sum. */
export declare function getBalance(store: BillingLedgerStore, developerId: string): Promise<number>;
/**
 * Operator-facing margin detail for a charged Job: the provider-cost line and
 * margin line exactly as persisted on the Job's `charge` row, plus the
 * consistency flag and the total charged. This is a straight round-trip of the
 * stored values — neither line is ever recomputed (Req 10.4, Property 20).
 */
export interface MarginDetail {
    job_id: string;
    /** Owner (developer) id of the charge row. */
    developer_id: string;
    /** provider-cost line item, as stored (2 dp). */
    provider_cost_usd: number;
    /** margin line item, as stored (2 dp). */
    margin_usd: number;
    /** Total charged for the Job (magnitude of the stored negative amount). */
    total_charged_usd: number;
    /** Stored consistency flag; `false` marks a flagged charge (Req 10.3). */
    charge_consistent: boolean;
    /** The stored charge event id, for cross-reference. */
    charge_event_id: string;
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
export declare function getMarginDetail(store: BillingLedgerStore, jobId: string): Promise<MarginDetail | undefined>;
export type { RefundOutcome };
