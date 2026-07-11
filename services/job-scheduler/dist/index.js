"use strict";
/**
 * Job_Scheduler Express server with worker pool.
 * Requirements: 8.6, 8.2, 8.3
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workerPoolSize = exports.activeWorkers = exports.jobQueue = exports.jobStore = void 0;
exports.enqueueJob = enqueueJob;
const express_1 = __importDefault(require("express"));
const shared_1 = require("@neuralgrid/shared");
const dispatcher_1 = require("./dispatcher");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8002;
const WORKER_POOL_SIZE = parseInt(process.env.WORKER_POOL_SIZE || "", 10) || shared_1.DEFAULT_WORKER_POOL_SIZE;
exports.workerPoolSize = WORKER_POOL_SIZE;
app.use(express_1.default.json());
// --- In-memory job store (MVP, no PostgreSQL dependency) ---
const jobStore = new Map();
exports.jobStore = jobStore;
// --- Worker pool ---
let activeWorkers = 0;
exports.activeWorkers = activeWorkers;
const jobQueue = [];
exports.jobQueue = jobQueue;
function enqueueJob(request) {
    // Store initial queued status
    jobStore.set(request.job_id, {
        job_id: request.job_id,
        status: "queued",
        retries: 0,
    });
    jobQueue.push(request);
    processQueue();
}
function processQueue() {
    while (activeWorkers < WORKER_POOL_SIZE && jobQueue.length > 0) {
        const job = jobQueue.shift();
        exports.activeWorkers = (activeWorkers++, activeWorkers);
        runJob(job).finally(() => {
            exports.activeWorkers = (activeWorkers--, activeWorkers);
            processQueue();
        });
    }
}
async function runJob(request) {
    // Mark as running
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
        const result = await (0, dispatcher_1.dispatchJob)(request, allNodes);
        jobStore.set(request.job_id, result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        jobStore.set(request.job_id, {
            job_id: request.job_id,
            status: "failed",
            retries: 0,
        });
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
    const body = req.body;
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
exports.default = app;
//# sourceMappingURL=index.js.map