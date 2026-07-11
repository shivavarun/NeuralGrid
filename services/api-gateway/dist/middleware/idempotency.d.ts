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
import type Redis from 'ioredis';
import { ErrorCode } from '@neuralgrid/shared';
import type { JobStatus } from '@neuralgrid/shared';
/** Idempotency-Key header name (case-insensitive lookup via req.header). */
export declare const IDEMPOTENCY_HEADER = "Idempotency-Key";
/** Association + Redis lock retention: 24 hours. */
export declare const IDEMPOTENCY_TTL_MS: number;
export declare function isTerminalStatus(status: JobStatus): boolean;
export type KeyValidation = {
    valid: true;
    key: string;
} | {
    valid: false;
    code: ErrorCode;
    message: string;
};
/**
 * Validate the Idempotency-Key header value.
 * Missing  -> MISSING_IDEMPOTENCY_KEY (400)
 * Empty or > 255 chars -> INVALID_IDEMPOTENCY_KEY (400)
 */
export declare function validateIdempotencyKey(value: string | undefined | null): KeyValidation;
/**
 * Produce a canonical, deterministic serialization of a JSON-compatible value.
 * Object keys are sorted recursively so that key ordering never affects the
 * hash, while any value difference produces a different string.
 */
export declare function canonicalizeBody(body: unknown): string;
/** sha256 (hex) of the canonicalized request body. */
export declare function hashRequestBody(body: unknown): string;
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
    created_at: string;
}
export type InsertResult = {
    inserted: true;
} | {
    inserted: false;
    existing: IdempotencyAssociation;
};
/**
 * Persistence for idempotency associations. `insert` MUST enforce
 * UNIQUE(developer_id, idempotency_key) and, on violation, return the existing
 * row so the caller can resolve the race as an existing-key match.
 */
export interface IdempotencyStore {
    get(developerId: string, key: string): Promise<IdempotencyAssociation | null>;
    insert(assoc: IdempotencyAssociation): Promise<InsertResult>;
    updateSnapshot(developerId: string, key: string, snapshot: CachedResponse, status: JobStatus): Promise<void>;
}
/**
 * In-memory association store honoring 24h expiry and the per-developer
 * uniqueness constraint that migration 002 enforces at the DB level.
 */
export declare class InMemoryIdempotencyStore implements IdempotencyStore {
    private readonly ttlMs;
    private readonly records;
    constructor(ttlMs?: number);
    private compositeKey;
    private isExpired;
    get(developerId: string, key: string): Promise<IdempotencyAssociation | null>;
    insert(assoc: IdempotencyAssociation): Promise<InsertResult>;
    updateSnapshot(developerId: string, key: string, snapshot: CachedResponse, status: JobStatus): Promise<void>;
}
/**
 * Short-lived lock preventing two concurrent first-time submissions for the
 * same (developer, key) from both proceeding. Keyed `idem:{developer}:{key}`.
 */
export interface IdempotencyLock {
    acquire(developerId: string, key: string): Promise<boolean>;
    release(developerId: string, key: string): Promise<void>;
}
/** Redis-backed lock using SET NX PX (atomic acquire with TTL). */
export declare class RedisIdempotencyLock implements IdempotencyLock {
    private readonly redis;
    private readonly ttlMs;
    constructor(redis: Redis, ttlMs?: number);
    acquire(developerId: string, key: string): Promise<boolean>;
    release(developerId: string, key: string): Promise<void>;
}
/** In-memory lock for MVP / single-process deployments and tests. */
export declare class InMemoryIdempotencyLock implements IdempotencyLock {
    private readonly held;
    acquire(developerId: string, key: string): Promise<boolean>;
    release(developerId: string, key: string): Promise<void>;
}
export type IdempotencyOutcome = {
    kind: 'new';
} | {
    kind: 'replay';
    response: CachedResponse;
} | {
    kind: 'conflict';
} | {
    kind: 'in_progress';
};
/**
 * Resolve how to handle a request whose key already has an association.
 *  - body differs                          -> conflict (409 IDEMPOTENCY_CONFLICT)
 *  - body identical + job terminal         -> replay cached response
 *  - body identical + job non-terminal     -> in_progress (409 IDEMPOTENCY_IN_PROGRESS)
 */
export declare function resolveExisting(existing: IdempotencyAssociation, requestHash: string): Exclude<IdempotencyOutcome, {
    kind: 'new';
}>;
/** Default dependency bundle for a single-process MVP deployment. */
export interface IdempotencyDeps {
    store: IdempotencyStore;
    lock: IdempotencyLock;
}
export declare function createDefaultIdempotencyDeps(redis?: Redis): IdempotencyDeps;
