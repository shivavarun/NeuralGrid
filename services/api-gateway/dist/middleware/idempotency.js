"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryIdempotencyLock = exports.RedisIdempotencyLock = exports.InMemoryIdempotencyStore = exports.IDEMPOTENCY_TTL_MS = exports.IDEMPOTENCY_HEADER = void 0;
exports.isTerminalStatus = isTerminalStatus;
exports.validateIdempotencyKey = validateIdempotencyKey;
exports.canonicalizeBody = canonicalizeBody;
exports.hashRequestBody = hashRequestBody;
exports.resolveExisting = resolveExisting;
exports.createDefaultIdempotencyDeps = createDefaultIdempotencyDeps;
const crypto_1 = require("crypto");
const shared_1 = require("@neuralgrid/shared");
// --- Constants ---
/** Idempotency-Key header name (case-insensitive lookup via req.header). */
exports.IDEMPOTENCY_HEADER = 'Idempotency-Key';
/** Association + Redis lock retention: 24 hours. */
exports.IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** Terminal job statuses — only these permit a cached replay. */
const TERMINAL_STATUSES = new Set([
    'complete',
    'failed',
]);
function isTerminalStatus(status) {
    return TERMINAL_STATUSES.has(status);
}
/**
 * Validate the Idempotency-Key header value.
 * Missing  -> MISSING_IDEMPOTENCY_KEY (400)
 * Empty or > 255 chars -> INVALID_IDEMPOTENCY_KEY (400)
 */
function validateIdempotencyKey(value) {
    if (value === undefined || value === null) {
        return {
            valid: false,
            code: shared_1.ErrorCode.MISSING_IDEMPOTENCY_KEY,
            message: 'Missing required Idempotency-Key header',
        };
    }
    if (value.length < 1 || value.length > 255) {
        return {
            valid: false,
            code: shared_1.ErrorCode.INVALID_IDEMPOTENCY_KEY,
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
function canonicalizeBody(body) {
    return JSON.stringify(canonicalize(body));
}
function canonicalize(value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    const record = value;
    const sorted = {};
    for (const key of Object.keys(record).sort()) {
        sorted[key] = canonicalize(record[key]);
    }
    return sorted;
}
/** sha256 (hex) of the canonicalized request body. */
function hashRequestBody(body) {
    return (0, crypto_1.createHash)('sha256').update(canonicalizeBody(body)).digest('hex');
}
/**
 * In-memory association store honoring 24h expiry and the per-developer
 * uniqueness constraint that migration 002 enforces at the DB level.
 */
class InMemoryIdempotencyStore {
    constructor(ttlMs = exports.IDEMPOTENCY_TTL_MS) {
        this.ttlMs = ttlMs;
        this.records = new Map();
    }
    compositeKey(developerId, key) {
        return `${developerId}\u0000${key}`;
    }
    isExpired(assoc) {
        return Date.now() - new Date(assoc.created_at).getTime() >= this.ttlMs;
    }
    async get(developerId, key) {
        const composite = this.compositeKey(developerId, key);
        const assoc = this.records.get(composite);
        if (!assoc)
            return null;
        if (this.isExpired(assoc)) {
            this.records.delete(composite);
            return null;
        }
        return assoc;
    }
    async insert(assoc) {
        const composite = this.compositeKey(assoc.developer_id, assoc.idempotency_key);
        const existing = this.records.get(composite);
        if (existing && !this.isExpired(existing)) {
            // UNIQUE(developer_id, idempotency_key) violation -> race arbiter.
            return { inserted: false, existing };
        }
        this.records.set(composite, assoc);
        return { inserted: true };
    }
    async updateSnapshot(developerId, key, snapshot, status) {
        const composite = this.compositeKey(developerId, key);
        const assoc = this.records.get(composite);
        if (assoc) {
            assoc.response_snapshot = snapshot;
            assoc.status = status;
        }
    }
}
exports.InMemoryIdempotencyStore = InMemoryIdempotencyStore;
function lockKey(developerId, key) {
    return `idem:${developerId}:${key}`;
}
/** Redis-backed lock using SET NX PX (atomic acquire with TTL). */
class RedisIdempotencyLock {
    constructor(redis, ttlMs = exports.IDEMPOTENCY_TTL_MS) {
        this.redis = redis;
        this.ttlMs = ttlMs;
    }
    async acquire(developerId, key) {
        const result = await this.redis.set(lockKey(developerId, key), '1', 'PX', this.ttlMs, 'NX');
        return result === 'OK';
    }
    async release(developerId, key) {
        await this.redis.del(lockKey(developerId, key));
    }
}
exports.RedisIdempotencyLock = RedisIdempotencyLock;
/** In-memory lock for MVP / single-process deployments and tests. */
class InMemoryIdempotencyLock {
    constructor() {
        this.held = new Set();
    }
    async acquire(developerId, key) {
        const composite = lockKey(developerId, key);
        if (this.held.has(composite))
            return false;
        this.held.add(composite);
        return true;
    }
    async release(developerId, key) {
        this.held.delete(lockKey(developerId, key));
    }
}
exports.InMemoryIdempotencyLock = InMemoryIdempotencyLock;
/**
 * Resolve how to handle a request whose key already has an association.
 *  - body differs                          -> conflict (409 IDEMPOTENCY_CONFLICT)
 *  - body identical + job terminal         -> replay cached response
 *  - body identical + job non-terminal     -> in_progress (409 IDEMPOTENCY_IN_PROGRESS)
 */
function resolveExisting(existing, requestHash) {
    if (existing.request_hash !== requestHash) {
        return { kind: 'conflict' };
    }
    if (isTerminalStatus(existing.status)) {
        return { kind: 'replay', response: existing.response_snapshot };
    }
    return { kind: 'in_progress' };
}
function createDefaultIdempotencyDeps(redis) {
    return {
        store: new InMemoryIdempotencyStore(),
        lock: redis ? new RedisIdempotencyLock(redis) : new InMemoryIdempotencyLock(),
    };
}
//# sourceMappingURL=idempotency.js.map