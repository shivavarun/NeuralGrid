/**
 * Pre-deploy load test gate (Task 29.1 / Requirement 24).
 *
 * End-to-end confirmation of the Idempotency_Key guarantee (task 2.1) under a
 * retry storm: 500 concurrent job submissions inside a 60s window, each retried
 * up to 3 times (so up to 2000 total requests sharing 500 unique keys).
 *
 * The gate asserts two things and blocks deployment (fails) reporting which
 * check failed otherwise:
 *   1. Exactly 500 charges are recorded — zero duplicates. A charge is recorded
 *      once per real dispatch to Job_Scheduler; a working idempotency layer
 *      dispatches (and therefore charges) exactly once per key regardless of
 *      how many retries collide.
 *   2. P95 dispatch latency <= 2000 ms over the 500 accepted submissions.
 *
 * Runs deterministically in-process: estimator / price / scheduler HTTP calls
 * are mocked via an injected HttpClient, and the router is wired with the same
 * in-memory idempotency store + lock the shipped MVP uses.
 *
 * Validates: Requirements 24.1, 24.2, 24.3, 24.4, 24.5
 */

import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Server } from 'http';
import { createJobsRouter, HttpClient, jobOwnershipStore } from '../routes/jobs';

// --- Load parameters (Req 24.1) ---

const SUBMISSION_COUNT = 500; // unique jobs / idempotency keys
const RETRIES_PER_SUBMISSION = 3; // each key sent 1 + up to 3 more times
const ATTEMPTS_PER_KEY = 1 + RETRIES_PER_SUBMISSION;
const WINDOW_MS = 60_000; // 60s window (Req 24.1)
const P95_LATENCY_BUDGET_MS = 2000; // Req 24.3
// Batch of keys processed concurrently; bounds open sockets while keeping the
// per-key attempts overlapping so the in-progress race is genuinely exercised.
const KEY_BATCH_SIZE = 20;

// --- Deterministic upstream fixtures ---

const mockEstimate = {
  tier: 'T1',
  min_vram_gb: 10,
  estimated_runtime_seconds: 30,
  estimated_cost_usd: '0.50',
  confidence: 'HIGH',
};

const mockPriceResponse = {
  nodes: [
    { provider: 'vastai', node_id: 'v1', gpu_model: 'RTX 3090', vram_gb: 24, hourly_rate_usd: 0.3, availability: true },
    { provider: 'runpod', node_id: 'r1', gpu_model: 'RTX 4090', vram_gb: 24, hourly_rate_usd: 0.5, availability: true },
  ],
  cached: false,
  cache_age_seconds: 0,
};

function jobBody(seed: number) {
  return {
    model: 'llama-3-8b',
    input: { type: 'text', content: `load-test prompt ${seed}` },
    output: { type: 'text', max_tokens: 100 },
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

/** Build an app whose dispatch records exactly one charge per dispatched job. */
function makeLoadApp() {
  // A charge ledger: one entry appended per real dispatch to Job_Scheduler.
  const charges: string[] = []; // job_ids charged (charge == dispatch)

  const httpClient: HttpClient = {
    post: vi.fn(async (url: string, body: unknown) => {
      if (url.includes('/internal/estimate')) {
        return { status: 200, data: mockEstimate };
      }
      if (url.includes('/internal/dispatch')) {
        const jobId = (body as { job_id: string }).job_id;
        charges.push(jobId); // record the charge for this dispatch
        return { status: 202, data: { accepted: true } };
      }
      return { status: 200, data: {} };
    }),
    get: vi.fn(async (url: string) => {
      if (url.includes('/internal/prices/')) {
        return { status: 200, data: mockPriceResponse };
      }
      return { status: 200, data: {} };
    }),
  };

  const app = express();
  app.use(express.json());
  // Single developer; the 500 unique idempotency keys drive uniqueness.
  app.use((req, _res, next) => {
    (req as any).developerId = 'dev_loadtest';
    next();
  });
  // Router uses the shipped in-memory idempotency store + lock (task 2.1),
  // shared across every request to this app instance.
  app.use(createJobsRouter({ httpClient }));

  return { app, charges };
}

interface KeyResult {
  key: string;
  acceptedJobIds: string[]; // job_ids returned by 202 (accepted) attempts
  acceptedLatencyMs: number | null; // latency of the accepted submission
  statuses: number[];
}

async function runKey(server: Server, key: string, seed: number): Promise<KeyResult> {
  const body = jobBody(seed);
  const attempts = Array.from({ length: ATTEMPTS_PER_KEY }, async () => {
    const start = performance.now();
    const res = await request(server)
      .post('/v1/jobs')
      .set('Idempotency-Key', key)
      .send(body);
    const latency = performance.now() - start;
    return { res, latency };
  });

  const settled = await Promise.all(attempts);

  const acceptedJobIds: string[] = [];
  let acceptedLatencyMs: number | null = null;
  const statuses: number[] = [];
  for (const { res, latency } of settled) {
    statuses.push(res.status);
    if (res.status === 202) {
      acceptedJobIds.push(res.body.job_id);
      acceptedLatencyMs = latency; // one accepted per key under a correct guarantee
    }
  }
  return { key, acceptedJobIds, acceptedLatencyMs, statuses };
}

describe('Pre-deploy load test gate (Req 24)', () => {
  it(
    'records exactly 500 charges (zero duplicates) with P95 dispatch <= 2000ms under a 500-key retry storm',
    async () => {
      jobOwnershipStore.clear();
      const { app, charges } = makeLoadApp();
      const server = app.listen(0);

      const keyResults: KeyResult[] = [];
      const windowStart = performance.now();
      try {
        // Submit 500 keys, each retried up to 3x, in bounded-concurrency batches
        // so all attempts land within the 60s window without exhausting sockets.
        for (let batchStart = 0; batchStart < SUBMISSION_COUNT; batchStart += KEY_BATCH_SIZE) {
          const batch: Promise<KeyResult>[] = [];
          for (
            let i = batchStart;
            i < Math.min(batchStart + KEY_BATCH_SIZE, SUBMISSION_COUNT);
            i++
          ) {
            batch.push(runKey(server, `loadtest-key-${i}`, i));
          }
          keyResults.push(...(await Promise.all(batch)));
        }
      } finally {
        server.close();
      }
      const windowElapsedMs = performance.now() - windowStart;

      // --- Gather results ---
      const distinctChargedJobs = new Set(charges);
      const acceptedLatencies = keyResults
        .map((r) => r.acceptedLatencyMs)
        .filter((l): l is number => l !== null);
      const p95 = percentile(acceptedLatencies, 95);

      // Per-key duplicate detection: a correct guarantee yields exactly one
      // accepted submission (one job_id) per key.
      const keysWithDuplicateAccepts = keyResults.filter(
        (r) => new Set(r.acceptedJobIds).size > 1
      );
      const keysWithNoAccept = keyResults.filter((r) => r.acceptedJobIds.length === 0);

      // --- Report which check failed, then block deploy (fail) if any did ---
      const failures: string[] = [];

      // Window check (Req 24.1)
      if (windowElapsedMs > WINDOW_MS) {
        failures.push(
          `WINDOW: submissions took ${windowElapsedMs.toFixed(0)}ms, exceeds ${WINDOW_MS}ms window`
        );
      }

      // Charge check: exactly 500, zero duplicates (Req 24.2, 24.4)
      if (charges.length !== SUBMISSION_COUNT) {
        failures.push(
          `CHARGES: recorded ${charges.length} charges, expected exactly ${SUBMISSION_COUNT} (duplicate or missing charge)`
        );
      }
      if (distinctChargedJobs.size !== charges.length) {
        failures.push(
          `CHARGES: ${charges.length - distinctChargedJobs.size} duplicate charge(s) detected for the same job`
        );
      }
      if (keysWithDuplicateAccepts.length > 0) {
        failures.push(
          `IDEMPOTENCY: ${keysWithDuplicateAccepts.length} key(s) produced more than one job (duplicate charge)`
        );
      }
      if (keysWithNoAccept.length > 0) {
        failures.push(
          `IDEMPOTENCY: ${keysWithNoAccept.length} key(s) produced no job (missing charge)`
        );
      }

      // Latency check: P95 <= 2000ms (Req 24.3)
      if (p95 > P95_LATENCY_BUDGET_MS) {
        failures.push(
          `LATENCY: P95 dispatch latency ${p95.toFixed(1)}ms exceeds ${P95_LATENCY_BUDGET_MS}ms budget`
        );
      }

      // Deployment gate: any failed check blocks deploy (Req 24.5).
      expect(failures, `Load test gate failed — deployment blocked:\n${failures.join('\n')}`).toEqual([]);

      // Positive assertions for clarity when the gate passes.
      expect(charges.length).toBe(SUBMISSION_COUNT);
      expect(distinctChargedJobs.size).toBe(SUBMISSION_COUNT);
      expect(p95).toBeLessThanOrEqual(P95_LATENCY_BUDGET_MS);
    },
    WINDOW_MS + 30_000
  );
});
