/**
 * Job_Scheduler Express server with worker pool.
 * Requirements: 8.6, 8.2, 8.3
 */
import type { DispatchRequest, JobStatusResponse } from "@neuralgrid/shared";
declare const app: import("express-serve-static-core").Express;
declare const WORKER_POOL_SIZE: number;
declare const jobStore: Map<string, JobStatusResponse>;
declare let activeWorkers: number;
declare const jobQueue: DispatchRequest[];
declare function enqueueJob(request: DispatchRequest): void;
export default app;
export { jobStore, jobQueue, activeWorkers, enqueueJob, WORKER_POOL_SIZE as workerPoolSize };
