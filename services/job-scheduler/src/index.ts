/**
 * Job_Scheduler Express server with worker pool.
 * Requirements: 8.6, 8.2, 8.3
 */

import express from "express";
import type { DispatchRequest, JobStatusResponse } from "@neuralgrid/shared";
import { DEFAULT_WORKER_POOL_SIZE } from "@neuralgrid/shared";
import { dispatchJob } from "./dispatcher";
import { sloTracker, dispatchLatencyMs } from "./slo";

const app = express();
const PORT = process.env.PORT || 8002;
const WORKER_POOL_SIZE =
  parseInt(process.env.WORKER_POOL_SIZE || "", 10) || DEFAULT_WORKER_POOL_SIZE;

app.use(express.json());

// --- In-memory job store (MVP, no PostgreSQL dependency) ---
const jobStore = new Map<string, JobStatusResponse>();

// --- Worker pool ---
let activeWorkers = 0;
const jobQueue: DispatchRequest[] = [];

// Submission timestamps (job_id → epoch ms) for dispatch-latency SLO tracking.
const submittedAt = new Map<string, number>();

function enqueueJob(request: DispatchRequest): void {
  // Store initial queued status
  jobStore.set(request.job_id, {
    job_id: request.job_id,
    status: "queued",
    retries: 0,
  });

  submittedAt.set(request.job_id, Date.now());
  jobQueue.push(request);
  processQueue();
}

function processQueue(): void {
  while (activeWorkers < WORKER_POOL_SIZE && jobQueue.length > 0) {
    const job = jobQueue.shift()!;
    activeWorkers++;
    runJob(job).finally(() => {
      activeWorkers--;
      processQueue();
    });
  }
}

async function runJob(request: DispatchRequest): Promise<void> {
  // Mark as running — this is the dispatch point; record submission→dispatch latency.
  const submitted = submittedAt.get(request.job_id);
  if (submitted !== undefined) {
    sloTracker.recordDispatchLatency(dispatchLatencyMs(submitted, Date.now()));
    submittedAt.delete(request.job_id);
  }

  jobStore.set(request.job_id, {
    job_id: request.job_id,
    status: "running",
    provider: request.selected_node.provider,
    retries: 0,
  });

  try {
    // Use all nodes = [selected_node] for MVP (single node dispatch)
    // In production, would fetch available nodes from Price_Aggregator
    const allNodes = [request.selected_node];
    const result = await dispatchJob(request, allNodes);
    jobStore.set(request.job_id, result);
    sloTracker.recordJobOutcome(result.status === "complete" ? "COMPLETE" : "FAILED");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    jobStore.set(request.job_id, {
      job_id: request.job_id,
      status: "failed",
      retries: 0,
    });
    sloTracker.recordJobOutcome("FAILED");
    console.error(`Job ${request.job_id} failed unexpectedly: ${message}`);
  }
}

// --- Routes ---

/** Health check */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "job-scheduler",
    active_workers: activeWorkers,
    queue_length: jobQueue.length,
    pool_size: WORKER_POOL_SIZE,
  });
});

/** POST /internal/dispatch — accept dispatch request, enqueue job */
app.post("/internal/dispatch", (req, res) => {
  const body = req.body as DispatchRequest;

  if (!body.job_id || !body.model || !body.selected_node) {
    res.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Missing required fields: job_id, model, selected_node",
      },
    });
    return;
  }

  enqueueJob(body);

  res.status(202).json({
    job_id: body.job_id,
    status: "queued",
  });
});

/** GET /internal/slo — current SLO report (Req 21.2, 21.3) */
app.get("/internal/slo", (_req, res) => {
  res.json(sloTracker.report());
});

/** GET /internal/job/:id — return job status */
app.get("/internal/job/:id", (req, res) => {
  const jobId = req.params.id;
  const job = jobStore.get(jobId);

  if (!job) {
    res.status(404).json({
      error: {
        code: "JOB_NOT_FOUND",
        message: `Job ${jobId} not found`,
      },
    });
    return;
  }

  res.json(job);
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Job Scheduler listening on port ${PORT}`);
  console.log(`Worker pool size: ${WORKER_POOL_SIZE}`);
});

export default app;

// Export for testing
export { jobStore, jobQueue, activeWorkers, enqueueJob, WORKER_POOL_SIZE as workerPoolSize };
