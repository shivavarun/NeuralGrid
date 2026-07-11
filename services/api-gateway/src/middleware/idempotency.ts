/**
 * Idempotency_Key enforcement for POST /v1/jobs (Requirement 2).
 *
 * Responsibilities:
 *  - Validate the `Idempotency-Key` header (presence + 1..255 chars).
 *  - Canonicalize the request body and hash it (sha256 of canonical bytes) so
 *    logically-identical bodies compare equal while any difference is detected.
 *  - Persist a per-user association (developer_id, idempotency_key) for 24h,
 *    caching the original response so identical retries replay it.
 *  - Provide a Redis in-progress lock (`idem:{developer_id}:{key}`) plus a
 *    UNIQUE(developer_id, idempotency_key) constraint arbiter for the race
 *    between two concurrent first-time submissions.
 *
 * NOTE: This codebase uses the `developers` table (not `users`) and VARCHAR
 * string job IDs. Migration 002 shipped the uniqueness constraint as
 * `uq_jobs_developer_idempotency` on `(developer_id, idempotency_key)`; the
 * in-memory store below mirrors that constraint's semantics for the MVP.
 */

import { createHash } from 'crypto';
import type Redis from 'ioredis';
import { ErrorCode } from '@neuralgrid/shared';
import type { JobStatus } from '@neuralgrid/shared';

// --- Constants ---

/** Idempotency-Key header name (case-insensitive lookup via req.header). */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

/** Association + Redis lock retention: 24 hours. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Terminal job statuses — only these permit a cached replay. */
const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'complete',
  'failed',
]);

export function isTerminalStatus(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// --- Header validation (Req 2.1, 2.2) ---

export type KeyValidation =
  | { valid: true; key: string }
  | { valid: false; code: ErrorCode; message: string };

/**
 * Validate the Idempotency-Key header value.
 * Missing  -> MISSING_IDEMPOTENCY_KEY (400)
 * Empty or > 255 chars -> INVALID_IDEMPOTENCY_KEY (400)
 */
export function validateIdempotencyKey(value: string | undefined | null): KeyValidation {
  if (value === undefined || value === null) {
    return {
      valid: false,
      code: ErrorCode.MISSING_IDEMPOTENCY_KEY,
      message: 'Missing required Idempotency-Key header',
    };
  }
  if (value.length < 1 || value.length > 255) {
    return {
      valid: false,
      code: ErrorCode.INVALID_IDEMPOTENCY_KEY,
      message: 'Idempotency-Key header must be between 1 and 255 characters',
    };
  }
  return { valid: true, key: value };
}

// --- Request-body canonicalization + hashing (Req 2.4, 2.5) ---

/**
 * Produce a canonical, deterministic serialization of a JSON-compatible value.
 * Object keys are sorted recursively so that key ordering never affects the
 * hash, while any value difference produces a different string.
 */
export function canonicalizeBody(body: unknown): string {
  return JSON.stringify(canonicalize(body));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = canonicalize(record[key]);
  }
  return sorted;
}

/** sha256 (hex) of the canonicalized request body. */
export function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(canonicalizeBody(body)).digest('hex');
}

// --- Association store (durable in production; in-memory for MVP) ---

/** The exact response that was returned when the job was first created. */
export interface CachedResponse {
  statusCode: number;
  body: unknown;
}

export interface IdempotencyAssociation {
  developer_id: string;
  idempotency_key: string;
  job_id: string;
  request_hash: string;
  response_snapshot: CachedResponse;
  status: JobStatus;
  created_at: string; // ISO 8601; retained 24h from creation
}

export type InsertResult =
  | { inserted: true }
  | { inserted: false; existing: IdempotencyAssociation };

/**
 * Persistence for idempotency associations. `insert` MUST enforce
 * UNIQUE(developer_id, idempotency_key) and, on violation, return the existing
 * row so the caller can resolve the race as an existing-key match.
 */
export interface IdempotencyStore {
  get(developerId: string, key: string): Promise<IdempotencyAssociation | null>;
  insert(assoc: IdempotencyAssociation): Promise<InsertResult>;
  updateSnapshot(
    developerId: string,
    key: string,
    snapshot: CachedResponse,
    status: JobStatus
  ): Promise<void>;
}

/**
 * In-memory association store honoring 24h expiry and the per-developer
 * uniqueness constraint that migration 002 enforces at the DB level.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyAssociation>();

  constructor(private readonly ttlMs: number = IDEMPOTENCY_TTL_MS) {}

  private compositeKey(developerId: string, key: string): string {
    return `${developerId}\u0000${key}`;
  }

  private isExpired(assoc: IdempotencyAssociation): boolean {
    return Date.now() - new Date(assoc.created_at).getTime() >= this.ttlMs;
  }

  async get(developerId: string, key: string): Promise<IdempotencyAssociation | null> {
    const composite = this.compositeKey(developerId, key);
    const assoc = this.records.get(composite);
    if (!assoc) return null;
    if (this.isExpired(assoc)) {
      this.records.delete(composite);
      return null;
    }
    return assoc;
  }

  async insert(assoc: IdempotencyAssociation): Promise<InsertResult> {
    const composite = this.compositeKey(assoc.developer_id, assoc.idempotency_key);
    const existing = this.records.get(composite);
    if (existing && !this.isExpired(existing)) {
      // UNIQUE(developer_id, idempotency_key) violation -> race arbiter.
      return { inserted: false, existing };
    }
    this.records.set(composite, assoc);
    return { inserted: true };
  }

  async updateSnapshot(
    developerId: string,
    key: string,
    snapshot: CachedResponse,
    status: JobStatus
  ): Promise<void> {
    const composite = this.compositeKey(developerId, key);
    const assoc = this.records.get(composite);
    if (assoc) {
      assoc.response_snapshot = snapshot;
      assoc.status = status;
    }
  }
}

// --- In-progress lock (Redis in production; in-memory for MVP) ---

/**
 * Short-lived lock preventing two concurrent first-time submissions for the
 * same (developer, key) from both proceeding. Keyed `idem:{developer}:{key}`.
 */
export interface IdempotencyLock {
  acquire(developerId: string, key: string): Promise<boolean>;
  release(developerId: string, key: string): Promise<void>;
}

function lockKey(developerId: string, key: string): string {
  return `idem:${developerId}:${key}`;
}

/** Redis-backed lock using SET NX PX (atomic acquire with TTL). */
export class RedisIdempotencyLock implements IdempotencyLock {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs: number = IDEMPOTENCY_TTL_MS
  ) {}

  async acquire(developerId: string, key: string): Promise<boolean> {
    const result = await this.redis.set(
      lockKey(developerId, key),
      '1',
      'PX',
      this.ttlMs,
      'NX'
    );
    return result === 'OK';
  }

  async release(developerId: string, key: string): Promise<void> {
    await this.redis.del(lockKey(developerId, key));
  }
}

/** In-memory lock for MVP / single-process deployments and tests. */
export class InMemoryIdempotencyLock implements IdempotencyLock {
  private readonly held = new Set<string>();

  async acquire(developerId: string, key: string): Promise<boolean> {
    const composite = lockKey(developerId, key);
    if (this.held.has(composite)) return false;
    this.held.add(composite);
    return true;
  }

  async release(developerId: string, key: string): Promise<void> {
    this.held.delete(lockKey(developerId, key));
  }
}

// --- Resolution of an existing association (Req 2.4, 2.5, 2.6) ---

export type IdempotencyOutcome =
  | { kind: 'new' }
  | { kind: 'replay'; response: CachedResponse }
  | { kind: 'conflict' }
  | { kind: 'in_progress' };

/**
 * Resolve how to handle a request whose key already has an association.
 *  - body differs                          -> conflict (409 IDEMPOTENCY_CONFLICT)
 *  - body identical + job terminal         -> replay cached response
 *  - body identical + job non-terminal     -> in_progress (409 IDEMPOTENCY_IN_PROGRESS)
 */
export function resolveExisting(
  existing: IdempotencyAssociation,
  requestHash: string
): Exclude<IdempotencyOutcome, { kind: 'new' }> {
  if (existing.request_hash !== requestHash) {
    return { kind: 'conflict' };
  }
  if (isTerminalStatus(existing.status)) {
    return { kind: 'replay', response: existing.response_snapshot };
  }
  return { kind: 'in_progress' };
}

/** Default dependency bundle for a single-process MVP deployment. */
export interface IdempotencyDeps {
  store: IdempotencyStore;
  lock: IdempotencyLock;
}

export function createDefaultIdempotencyDeps(redis?: Redis): IdempotencyDeps {
  return {
    store: new InMemoryIdempotencyStore(),
    lock: redis ? new RedisIdempotencyLock(redis) : new InMemoryIdempotencyLock(),
  };
}
