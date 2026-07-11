/**
 * Audit_Log recording — append-only admin-action audit trail (Req 27).
 *
 * Every admin action that modifies user data (credit grant, refund, API key
 * revocation, etc.) must leave one durable audit row recording WHO did WHAT to
 * WHICH target, with what OUTCOME, and WHEN. The row is written whether the
 * action succeeded or failed (Req 27.1, 27.3): a failed action still records a
 * row with `outcome = 'failure'`.
 *
 * Storage model (migration 002 `audit_log`):
 *   id, actor_id, action_type, target_id, outcome ('success'|'failure'),
 *   created_at (TIMESTAMPTZ). Immutability is enforced at the database by a
 *   trigger that rejects UPDATE/DELETE on existing rows (Req 27.2, 27.4); this
 *   module never issues an update or delete, so the trigger is a backstop, not a
 *   code path. The in-memory MVP store mirrors that append-only contract by
 *   exposing only append + read surfaces.
 *
 * Design shape (mirrors `billingLedger.ts` / `autoRefund.ts`):
 *  - `AuditLogStore` is an injectable, async, DB-ready interface. The MVP ships
 *    an in-memory implementation; a PostgreSQL-backed one writing the
 *    migration-002 table can be substituted behind the same interface with no
 *    caller changes.
 *  - `buildAuditEntry` is a pure function (timestamp + id injected), so it is
 *    trivially unit/property testable.
 *  - `recordAuditEntry` and `withAudit` are the light-touch wiring surface: the
 *    admin mutation paths (auto-refund 10.1, key management 13.1, admin guard
 *    15.1) call the recorder / wrap their mutation so the audit row is written
 *    without rewriting those modules.
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4
 */

// --- Domain types ---

/** Outcome of an audited admin action (mirrors the DB CHECK constraint). */
export type AuditOutcome = "success" | "failure";

/**
 * Well-known admin action types. Kept as a string union for the common cases
 * but widened to `string` so a new admin mutation can record without a shared
 * schema change (the DB column is free-text `action_type`).
 */
export type AuditActionType =
  | "credit_grant"
  | "refund"
  | "key_revoke"
  | "key_create"
  | (string & {});

/**
 * A persisted `audit_log` row. Field names match the migration-002 columns so a
 * DB-backed store maps 1:1.
 */
export interface AuditLogEntry {
  /** Row id (UUID in the DB; opaque string here). */
  id: string;
  /** Identifier of the admin/actor who performed the action. */
  actor_id: string;
  /** What was done: `credit_grant`, `refund`, `key_revoke`, ... */
  action_type: AuditActionType;
  /** Identifier of the entity acted upon (user id, key id, job id, ...). */
  target_id: string;
  /** Whether the action succeeded or failed (Req 27.1, 27.3). */
  outcome: AuditOutcome;
  /** UTC ISO 8601 timestamp of when the row was recorded (Req 27.1). */
  created_at: string;
}

/** The caller-supplied facts about an admin action, minus id + timestamp. */
export interface AuditActionInput {
  actor_id: string;
  action_type: AuditActionType;
  target_id: string;
  outcome: AuditOutcome;
}

// --- Injectable, DB-ready store interface ---

/**
 * Append-only store for the `audit_log`. Callers depend only on this interface.
 *
 * There is deliberately NO update or delete surface: audit rows are immutable
 * once written (Req 27.2). A PostgreSQL-backed implementation writing the
 * migration-002 table (whose trigger rejects UPDATE/DELETE, Req 27.4) satisfies
 * this same interface unchanged.
 */
export interface AuditLogStore {
  /** Append one audit row and return the persisted entry. */
  append(entry: AuditLogEntry): Promise<AuditLogEntry>;
  /** All audit rows for a given target, in append order. */
  listByTarget(targetId: string): Promise<AuditLogEntry[]>;
  /** All audit rows for a given actor, in append order. */
  listByActor(actorId: string): Promise<AuditLogEntry[]>;
}

// --- ID + timestamp generation (injectable for testing) ---

let auditIdCounter = 0;

/** Default audit-row id generator. */
export function generateAuditId(): string {
  auditIdCounter++;
  return `audit_${auditIdCounter}_${Date.now()}`;
}

/** Reset the module-level audit id counter (test helper). */
export function resetAuditIdCounter(): void {
  auditIdCounter = 0;
}

/**
 * Deps for building/recording an audit entry. `generateId` and `now` default to
 * real implementations but are injectable so tests get deterministic rows.
 */
export interface AuditDeps {
  generateId?: () => string;
  /** Returns a UTC ISO 8601 timestamp. */
  now?: () => string;
}

// --- Pure builder (no I/O) ---

/**
 * Build a complete `AuditLogEntry` from the action facts, stamping a fresh id
 * and a UTC ISO 8601 `created_at`. Pure given its injected id/clock.
 */
export function buildAuditEntry(
  input: AuditActionInput,
  deps: AuditDeps = {}
): AuditLogEntry {
  const generateId = deps.generateId ?? generateAuditId;
  const now = deps.now ?? (() => new Date().toISOString());
  return {
    id: generateId(),
    actor_id: input.actor_id,
    action_type: input.action_type,
    target_id: input.target_id,
    outcome: input.outcome,
    created_at: now(),
  };
}

// --- In-memory store implementation (MVP) ---

/**
 * In-memory, append-only audit store. Enforces append semantics by only ever
 * pushing; there is deliberately no update or delete surface (Req 27.2).
 */
export class InMemoryAuditLogStore implements AuditLogStore {
  private readonly entries: AuditLogEntry[] = [];

  async append(entry: AuditLogEntry): Promise<AuditLogEntry> {
    // Defensive copy so callers can't mutate a stored row after the fact.
    const stored: AuditLogEntry = { ...entry };
    this.entries.push(stored);
    return { ...stored };
  }

  async listByTarget(targetId: string): Promise<AuditLogEntry[]> {
    return this.entries
      .filter((e) => e.target_id === targetId)
      .map((e) => ({ ...e }));
  }

  async listByActor(actorId: string): Promise<AuditLogEntry[]> {
    return this.entries
      .filter((e) => e.actor_id === actorId)
      .map((e) => ({ ...e }));
  }

  /** All entries, append order. Test/inspection helper. */
  async listAll(): Promise<AuditLogEntry[]> {
    return this.entries.map((e) => ({ ...e }));
  }

  /** Clear all state. Test helper only. */
  reset(): void {
    this.entries.length = 0;
  }
}

/** Convenience factory for the default (in-memory) store. */
export function createInMemoryAuditLogStore(): InMemoryAuditLogStore {
  return new InMemoryAuditLogStore();
}

// --- Recording function (append a typed row through the store) ---

/**
 * Record a single admin action to the audit log (Req 27.1). Works for both
 * success and failure outcomes; the caller supplies `outcome`.
 *
 * Returns the persisted entry. This is the low-level recorder; most callers will
 * prefer {@link withAudit}, which derives the outcome from whether the wrapped
 * mutation threw.
 */
export async function recordAuditEntry(
  store: AuditLogStore,
  input: AuditActionInput,
  deps: AuditDeps = {}
): Promise<AuditLogEntry> {
  const entry = buildAuditEntry(input, deps);
  return store.append(entry);
}

// --- Light-touch wiring surface ---

/**
 * The facts about an admin action that are known BEFORE it runs. `withAudit`
 * fills in the `outcome` based on whether the action threw.
 */
export interface AuditContext {
  actor_id: string;
  action_type: AuditActionType;
  target_id: string;
}

/**
 * An audit recorder bound to a store (and optional deps). This is the minimal
 * hook the admin mutation paths (auto-refund 10.1, key management 13.1, admin
 * guard 15.1) receive by injection, so they can record without importing the
 * store directly or being rewritten.
 */
export interface AuditRecorder {
  /** Record a completed action with an explicit outcome. */
  record(input: AuditActionInput): Promise<AuditLogEntry>;
  /**
   * Run an admin mutation and record its outcome automatically: `success` if it
   * resolves, `failure` if it throws (Req 27.1, 27.3). The original result is
   * returned on success; the original error is re-thrown after the failure row
   * is recorded, so wrapping is transparent to the caller's control flow.
   */
  withAudit<T>(context: AuditContext, action: () => Promise<T>): Promise<T>;
}

/**
 * Build an {@link AuditRecorder} bound to the given store. This is the light-
 * touch integration point: rather than rewriting the completed 10.1/13.1/15.1
 * modules, each admin mutation path is handed a recorder and either calls
 * `record(...)` directly or wraps its mutation in `withAudit(...)`.
 *
 * Example (key revoke, task 13.1):
 *   await recorder.withAudit(
 *     { actor_id: adminId, action_type: "key_revoke", target_id: keyId },
 *     () => keyStore.revoke(keyId)
 *   );
 */
export function createAuditRecorder(
  store: AuditLogStore,
  deps: AuditDeps = {}
): AuditRecorder {
  return {
    record: (input) => recordAuditEntry(store, input, deps),
    async withAudit<T>(
      context: AuditContext,
      action: () => Promise<T>
    ): Promise<T> {
      try {
        const result = await action();
        await recordAuditEntry(
          store,
          { ...context, outcome: "success" },
          deps
        );
        return result;
      } catch (err) {
        // Record the attempted action as a failure (Req 27.3), then re-throw so
        // the caller's error handling is unchanged. If the audit append itself
        // fails, surface that rather than masking it.
        await recordAuditEntry(
          store,
          { ...context, outcome: "failure" },
          deps
        );
        throw err;
      }
    },
  };
}
