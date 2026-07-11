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
import { ErrorCode } from "@neuralgrid/shared";
import type { ProviderNode, SoftQueueEntry, Tier } from "@neuralgrid/shared";
/** Total time a job may remain in the Soft_Queue, from the queue-wait anchor. */
export declare const SOFT_QUEUE_MAX_WAIT_MS = 30000;
/** Re-check cadence for Price_Aggregator availability, from the anchor. */
export declare const SOFT_QUEUE_RECHECK_INTERVAL_MS = 5000;
/** Fixed tier-bump order (Req 1.5). */
export declare const TIER_ORDER: readonly Tier[];
/**
 * Next tier in the fixed T1->T2->T3 ladder, or null if the tier is already the
 * highest (T3) and therefore cannot be bumped (Req 1.5, 1.7).
 */
export declare function nextTier(tier: Tier): Tier | null;
/**
 * True once a job's wait has reached the 30s bound, measured from its
 * queue-wait anchor (Req 1.3).
 */
export declare function isExpired(entry: SoftQueueEntry, now: number): boolean;
/**
 * FIFO selection: among entries queued at `tier`, return the one with the
 * earliest queue-wait anchor (Req 1.8). Ties resolve to the first encountered.
 * Returns null when no entry is queued at that tier.
 */
export declare function selectFifoEntry(entries: SoftQueueEntry[], tier: Tier): SoftQueueEntry | null;
/**
 * Side-effecting collaborators, injected so the queue logic stays testable
 * without a real Price_Aggregator, dispatcher, or Job_Store.
 */
export interface SoftQueueDeps {
    /** Current time in ms epoch (injectable clock). */
    now(): number;
    /** Ask Price_Aggregator for an available node at a tier; null if none. */
    checkAvailability(tier: Tier): Promise<ProviderNode | null>;
    /** Dispatch a job to a node at a tier; resolves true on success. */
    dispatch(jobId: string, node: ProviderNode, tier: Tier): Promise<boolean>;
    /** Persist status=QUEUED and the queued_at anchor (Req 1.1). */
    persistQueued(jobId: string, tier: Tier, anchor: number): Promise<void>;
    /** Mark a job FAILED with a terminal error_code (Req 1.6, 1.7). */
    markFailed(jobId: string, errorCode: ErrorCode): Promise<void>;
    /** Load QUEUED jobs for restart rebuild (Req: reconstruct from Job_Store). */
    loadQueuedJobs(): Promise<SoftQueueEntry[]>;
}
export declare class SoftQueue {
    private readonly deps;
    private readonly entries;
    private timer;
    constructor(deps: SoftQueueDeps);
    /** Current queue size (observability/testing). */
    get size(): number;
    /** Snapshot of current queue membership. */
    list(): SoftQueueEntry[];
    /**
     * Park a job in the Soft_Queue: set status=QUEUED and record the queue-wait
     * anchor (Req 1.1). Called when no node exists at the job's assigned tier.
     */
    enqueue(jobId: string, tier: Tier): Promise<SoftQueueEntry>;
    /**
     * Rebuild queue membership from `jobs.status = QUEUED` on scheduler restart.
     * The persisted queued_at values preserve the original FIFO anchors.
     */
    rebuild(): Promise<void>;
    /**
     * One evaluation pass, run every 5s by the recheck loop (Req 1.2). Expired
     * jobs go through the tier-bump ladder first; remaining jobs are dispatched
     * FIFO to any newly available node at their tier.
     */
    processOnce(): Promise<void>;
    /**
     * Tier-bump ladder for a job whose 30s wait elapsed (Req 1.5, 1.6, 1.7).
     * T1/T2: one dispatch attempt at the next tier; success dequeues, otherwise
     * FAILED/NO_NODE_AVAILABLE. T3: FAILED/NO_NODE_AVAILABLE with no attempt.
     */
    private handleExpired;
    private fail;
    /** Begin the 5s recheck loop (Req 1.2). Idempotent. */
    start(): void;
    /** Stop the recheck loop. */
    stop(): void;
}
