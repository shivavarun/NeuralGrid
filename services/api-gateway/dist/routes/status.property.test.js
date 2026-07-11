"use strict";
/**
 * Property 9: Job Status Value Invariant
 * For any job, status is one of: queued, running, complete, failed.
 *
 * Property 10: Job Isolation
 * For any request where job belongs to different developer, verify 404 JOB_NOT_FOUND.
 *
 * Validates: Requirements 2.2, 2.3
 * Feature: neuralgrid-mvp, Property 9: Job Status Value Invariant, Property 10: Job Isolation
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const jobs_1 = require("./jobs");
const VALID_STATUSES = ['queued', 'running', 'complete', 'failed'];
function makeApp(deps) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // Simulate auth middleware — sets developerId on request
    app.use((req, _res, next) => {
        req.developerId = deps.developerId;
        next();
    });
    const router = (0, jobs_1.createJobsRouter)({ httpClient: deps.httpClient });
    app.use(router);
    return app;
}
function seedJob(jobId, developerId) {
    jobs_1.jobOwnershipStore.set(jobId, {
        job_id: jobId,
        developer_id: developerId,
        tier: 'T1',
        estimated_cost_usd: '1.00',
        output_type: 'text',
        created_at: new Date().toISOString(),
    });
}
(0, vitest_1.describe)('Property 9: Job Status Value Invariant', () => {
    (0, vitest_1.beforeEach)(() => {
        jobs_1.jobOwnershipStore.clear();
    });
    /**
     * Validates: Requirements 2.3
     *
     * For any status value returned by Job_Scheduler, the GET /v1/jobs/:id
     * response status field is always one of: queued, running, complete, failed.
     */
    (0, vitest_1.it)('response status is always one of queued|running|complete|failed', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(
        // Generate random status from valid set
        fast_check_1.default.constantFrom(...VALID_STATUSES), 
        // Random job ID suffix
        fast_check_1.default.hexaString({ minLength: 8, maxLength: 24 }), async (schedulerStatus, idSuffix) => {
            const jobId = `job_${idSuffix}`;
            const devId = 'dev_prop9';
            seedJob(jobId, devId);
            const httpClient = {
                post: vitest_1.vi.fn(),
                get: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        job_id: jobId,
                        status: schedulerStatus,
                        provider: 'vastai',
                        retries: 0,
                    },
                }),
            };
            const app = makeApp({ developerId: devId, httpClient });
            const res = await (0, supertest_1.default)(app).get(`/v1/jobs/${jobId}`);
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(VALID_STATUSES).toContain(res.body.status);
        }), { numRuns: 100 });
    });
});
(0, vitest_1.describe)('Property 10: Job Isolation', () => {
    (0, vitest_1.beforeEach)(() => {
        jobs_1.jobOwnershipStore.clear();
    });
    /**
     * Validates: Requirements 2.2
     *
     * For any job belonging to dev_A, a request from dev_B (different developer)
     * always gets 404 JOB_NOT_FOUND.
     */
    (0, vitest_1.it)('returns 404 JOB_NOT_FOUND when job belongs to different developer', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(
        // Owner developer ID
        fast_check_1.default.string({ minLength: 3, maxLength: 20 }).map((s) => `dev_owner_${s}`), 
        // Requester developer ID (always different)
        fast_check_1.default.string({ minLength: 3, maxLength: 20 }).map((s) => `dev_requester_${s}`), 
        // Random job ID suffix
        fast_check_1.default.hexaString({ minLength: 8, maxLength: 24 }), async (ownerId, requesterId, idSuffix) => {
            // Ensure IDs are actually different
            fast_check_1.default.pre(ownerId !== requesterId);
            const jobId = `job_${idSuffix}`;
            seedJob(jobId, ownerId);
            const httpClient = {
                post: vitest_1.vi.fn(),
                get: vitest_1.vi.fn(), // Should never be called
            };
            const app = makeApp({ developerId: requesterId, httpClient });
            const res = await (0, supertest_1.default)(app).get(`/v1/jobs/${jobId}`);
            (0, vitest_1.expect)(res.status).toBe(404);
            (0, vitest_1.expect)(res.body.error.code).toBe('JOB_NOT_FOUND');
            // Ensure Job_Scheduler was never called (isolation at gateway level)
            (0, vitest_1.expect)(httpClient.get).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=status.property.test.js.map