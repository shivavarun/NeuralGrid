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

// --- Timing bounds (Req 1.2, 1.3) ---

/** Total time a job may remain in the Soft_Queue, from the queue-wait anchor. */
export const SOFT_QUEUE_MAX_WAIT_MS = 30_000;

/** Re-check cadence for Price_Aggregator availability, from the anchor. */
export const SOFT_QUEUE_RECHECK_INTERVAL_MS = 5_000;

/** Fixed tier-bump order (Req 1.5). */
export const TIER_ORDER: readonly Tier[] = ["T1", "T2", "T3"] as const;

// --- Pure logic (independently testable) ---

/**
 * Next tier in the fixed T1->T2->T3 ladder, or null if the tier is already the
 * highest (T3) and therefore cannot be bumped (Req 1.5, 1.7).
 */
export function nextTier(tier: Tier): Tier | null {
  const idx = TIER_ORDER.indexOf(tier);
  if (idx < 0 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

/**
 * True once a job's wait has reached the 30s bound, measured from its
 * queue-wait anchor (Req 1.3).
 */
export function isExpired(entry: SoftQueueEntry, now: number): boolean {
  return now - entry.queue_wait_anchor >= SOFT_QUEUE_MAX_WAIT_MS;
}

/**
 * FIFO selection: among entries queued at `tier`, return the one with the
 * earliest queue-wait anchor (Req 1.8). Ties resolve to the first encountered.
 * Returns null when no entry is queued at that tier.
 */
export function selectFifoEntry(
  entries: SoftQueueEntry[],
  tier: Tier
): SoftQueueEntry | null {
  let earliest: SoftQueueEntry | null = null;
  for (const entry of entries) {
    if (entry.assigned_tier !== tier) continue;
    if (earliest === null || entry.queue_wait_anchor < earliest.queue_wait_anchor) {
      earliest = entry;
    }
  }
  return earliest;
}

// --- Orchestration ---

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

export class SoftQueue {
  private readonly entries = new Map<string, SoftQueueEntry>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: SoftQueueDeps) {}

  /** Current queue size (observability/testing). */
  get size(): number {
    return this.entries.size;
  }

  /** Snapshot of current queue membership. */
  list(): SoftQueueEntry[] {
    return [...this.entries.values()];
  }

  /**
   * Park a job in the Soft_Queue: set status=QUEUED and record the queue-wait
   * anchor (Req 1.1). Called when no node exists at the job's assigned tier.
   */
  async enqueue(jobId: string, tier: Tier): Promise<SoftQueueEntry> {
    const anchor = this.deps.now();
    const entry: SoftQueueEntry = {
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
  async rebuild(): Promise<void> {
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
  async processOnce(): Promise<void> {
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
      if (!node) continue;
      const entry = selectFifoEntry(this.list(), tier);
      if (!entry) continue;
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
  private async handleExpired(entry: SoftQueueEntry): Promise<void> {
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

  private async fail(jobId: string): Promise<void> {
    await this.deps.markFailed(jobId, ErrorCode.NO_NODE_AVAILABLE);
    this.entries.delete(jobId);
  }

  /** Begin the 5s recheck loop (Req 1.2). Idempotent. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.processOnce();
    }, SOFT_QUEUE_RECHECK_INTERVAL_MS);
  }

  /** Stop the recheck loop. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
