"use strict";
/**
 * Soft_Queue with FIFO ordering and one-shot tier-bump.
 *
 * On no node at a job's assigned tier the scheduler parks the job in a bounded
 * (30s) in-memory queue, re-checking the Price_Aggregator every 5s. When a node
 * appears the earliest-anchored eligible job (FIFO) is dispatched and dequeued.
 * At the 30s bound a T1/T2 job gets exactly one dispatch attempt at the next
 * tier (T1->T2->T3); on failure, or if the job is already T3, it is failed with
 * NO_NODE_AVAILABLE. Queue membership is reconstructable from
 * `jobs.status = QUEUED` + `queued_at`, so a scheduler restart rebuilds it.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoftQueue = exports.TIER_ORDER = exports.SOFT_QUEUE_RECHECK_INTERVAL_MS = exports.SOFT_QUEUE_MAX_WAIT_MS = void 0;
exports.nextTier = nextTier;
exports.isExpired = isExpired;
exports.selectFifoEntry = selectFifoEntry;
const shared_1 = require("@neuralgrid/shared");
// --- Timing bounds (Req 1.2, 1.3) ---
/** Total time a job may remain in the Soft_Queue, from the queue-wait anchor. */
exports.SOFT_QUEUE_MAX_WAIT_MS = 30000;
/** Re-check cadence for Price_Aggregator availability, from the anchor. */
exports.SOFT_QUEUE_RECHECK_INTERVAL_MS = 5000;
/** Fixed tier-bump order (Req 1.5). */
exports.TIER_ORDER = ["T1", "T2", "T3"];
// --- Pure logic (independently testable) ---
/**
 * Next tier in the fixed T1->T2->T3 ladder, or null if the tier is already the
 * highest (T3) and therefore cannot be bumped (Req 1.5, 1.7).
 */
function nextTier(tier) {
    const idx = exports.TIER_ORDER.indexOf(tier);
    if (idx < 0 || idx >= exports.TIER_ORDER.length - 1)
        return null;
    return exports.TIER_ORDER[idx + 1];
}
/**
 * True once a job's wait has reached the 30s bound, measured from its
 * queue-wait anchor (Req 1.3).
 */
function isExpired(entry, now) {
    return now - entry.queue_wait_anchor >= exports.SOFT_QUEUE_MAX_WAIT_MS;
}
/**
 * FIFO selection: among entries queued at `tier`, return the one with the
 * earliest queue-wait anchor (Req 1.8). Ties resolve to the first encountered.
 * Returns null when no entry is queued at that tier.
 */
function selectFifoEntry(entries, tier) {
    let earliest = null;
    for (const entry of entries) {
        if (entry.assigned_tier !== tier)
            continue;
        if (earliest === null || entry.queue_wait_anchor < earliest.queue_wait_anchor) {
            earliest = entry;
        }
    }
    return earliest;
}
class SoftQueue {
    constructor(deps) {
        this.deps = deps;
        this.entries = new Map();
    }
    /** Current queue size (observability/testing). */
    get size() {
        return this.entries.size;
    }
    /** Snapshot of current queue membership. */
    list() {
        return [...this.entries.values()];
    }
    /**
     * Park a job in the Soft_Queue: set status=QUEUED and record the queue-wait
     * anchor (Req 1.1). Called when no node exists at the job's assigned tier.
     */
    async enqueue(jobId, tier) {
        const anchor = this.deps.now();
        const entry = {
            job_id: jobId,
            assigned_tier: tier,
            queue_wait_anchor: anchor,
        };
        this.entries.set(jobId, entry);
        await this.deps.persistQueued(jobId, tier, anchor);
        return entry;
    }
    /**
     * Rebuild queue membership from `jobs.status = QUEUED` on scheduler restart.
     * The persisted queued_at values preserve the original FIFO anchors.
     */
    async rebuild() {
        const queued = await this.deps.loadQueuedJobs();
        this.entries.clear();
        for (const entry of queued) {
            this.entries.set(entry.job_id, entry);
        }
    }
    /**
     * One evaluation pass, run every 5s by the recheck loop (Req 1.2). Expired
     * jobs go through the tier-bump ladder first; remaining jobs are dispatched
     * FIFO to any newly available node at their tier.
     */
    async processOnce() {
        const now = this.deps.now();
        // 1. Jobs at the 30s bound: one-shot tier-bump then fail (Req 1.5-1.7).
        //    Process oldest-first for deterministic ordering.
        const expired = this.list()
            .filter((e) => isExpired(e, now))
            .sort((a, b) => a.queue_wait_anchor - b.queue_wait_anchor);
        for (const entry of expired) {
            await this.handleExpired(entry);
        }
        // 2. Still-waiting jobs: on availability, dispatch the earliest-anchored
        //    eligible job at each contended tier (FIFO, Req 1.4, 1.8).
        const activeTiers = new Set(this.list().map((e) => e.assigned_tier));
        for (const tier of activeTiers) {
            const node = await this.deps.checkAvailability(tier);
            if (!node)
                continue;
            const entry = selectFifoEntry(this.list(), tier);
            if (!entry)
                continue;
            const dispatched = await this.deps.dispatch(entry.job_id, node, tier);
            if (dispatched) {
                this.entries.delete(entry.job_id);
            }
        }
    }
    /**
     * Tier-bump ladder for a job whose 30s wait elapsed (Req 1.5, 1.6, 1.7).
     * T1/T2: one dispatch attempt at the next tier; success dequeues, otherwise
     * FAILED/NO_NODE_AVAILABLE. T3: FAILED/NO_NODE_AVAILABLE with no attempt.
     */
    async handleExpired(entry) {
        const bumped = nextTier(entry.assigned_tier);
        if (bumped === null) {
            // Already T3 (Req 1.7): fail without a tier-bump attempt.
            await this.fail(entry.job_id);
            return;
        }
        const node = await this.deps.checkAvailability(bumped);
        if (node) {
            const dispatched = await this.deps.dispatch(entry.job_id, node, bumped);
            if (dispatched) {
                this.entries.delete(entry.job_id);
                return;
            }
        }
        // Bump attempt found no node (or dispatch failed) (Req 1.6).
        await this.fail(entry.job_id);
    }
    async fail(jobId) {
        await this.deps.markFailed(jobId, shared_1.ErrorCode.NO_NODE_AVAILABLE);
        this.entries.delete(jobId);
    }
    /** Begin the 5s recheck loop (Req 1.2). Idempotent. */
    start() {
        if (this.timer)
            return;
        this.timer = setInterval(() => {
            void this.processOnce();
        }, exports.SOFT_QUEUE_RECHECK_INTERVAL_MS);
    }
    /** Stop the recheck loop. */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
}
exports.SoftQueue = SoftQueue;
//# sourceMappingURL=softQueue.js.map