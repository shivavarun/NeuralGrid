"use strict";
/**
 * Property 11: Result Availability Gate
 * For any non-complete job, verify 409 JOB_NOT_COMPLETE.
 *
 * Property 12: Result Shape by Output Type
 * For text jobs verify content/tokens/model/finish_reason.
 * For image jobs verify urls/expires/width/height.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 * Feature: neuralgrid-mvp, Property 11: Result Availability Gate
 * Feature: neuralgrid-mvp, Property 12: Result Shape by Output Type
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
function makeApp(deps) {
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // Simulate auth middleware
    app.use((req, _res, next) => {
        req.developerId = deps.developerId;
        next();
    });
    const router = (0, jobs_1.createJobsRouter)({ httpClient: deps.httpClient });
    app.use(router);
    return app;
}
(0, vitest_1.describe)('Property 11: Result Availability Gate', () => {
    (0, vitest_1.it)('returns 409 JOB_NOT_COMPLETE for any non-complete status', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(
        // Generate random non-complete statuses
        fast_check_1.default.constantFrom('queued', 'running', 'failed'), 
        // Generate random job ID suffix
        fast_check_1.default.hexaString({ minLength: 24, maxLength: 24 }), async (status, jobIdSuffix) => {
            const jobId = `job_${jobIdSuffix}`;
            const developerId = 'dev_prop11';
            // Setup ownership store
            jobs_1.jobOwnershipStore.set(jobId, {
                job_id: jobId,
                developer_id: developerId,
                tier: 'T1',
                estimated_cost_usd: '1.000000',
                output_type: 'text',
                created_at: new Date().toISOString(),
            });
            const httpClient = {
                post: vitest_1.vi.fn(),
                get: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        job_id: jobId,
                        status,
                        retries: 0,
                    },
                }),
            };
            const app = makeApp({ httpClient, developerId });
            const res = await (0, supertest_1.default)(app).get(`/v1/jobs/${jobId}/result`);
            (0, vitest_1.expect)(res.status).toBe(409);
            (0, vitest_1.expect)(res.body.error.code).toBe('JOB_NOT_COMPLETE');
            (0, vitest_1.expect)(res.body.error.details.current_status).toBe(status);
            // Cleanup
            jobs_1.jobOwnershipStore.delete(jobId);
        }), { numRuns: 100 });
    });
});
(0, vitest_1.describe)('Property 12: Result Shape by Output Type', () => {
    (0, vitest_1.it)('text jobs return content, tokens_generated, model, finish_reason', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.hexaString({ minLength: 24, maxLength: 24 }), fast_check_1.default.string({ minLength: 1, maxLength: 200 }), fast_check_1.default.nat({ max: 10000 }), fast_check_1.default.string({ minLength: 1, maxLength: 50 }), fast_check_1.default.constantFrom('stop', 'length', 'error'), async (jobIdSuffix, content, tokensGenerated, modelName, finishReason) => {
            const jobId = `job_${jobIdSuffix}`;
            const developerId = 'dev_prop12_text';
            // Setup ownership with text output type
            jobs_1.jobOwnershipStore.set(jobId, {
                job_id: jobId,
                developer_id: developerId,
                tier: 'T2',
                estimated_cost_usd: '2.500000',
                output_type: 'text',
                created_at: new Date().toISOString(),
            });
            const httpClient = {
                post: vitest_1.vi.fn(),
                get: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        job_id: jobId,
                        status: 'complete',
                        retries: 0,
                        result: {
                            content,
                            tokens_generated: tokensGenerated,
                            model: modelName,
                            finish_reason: finishReason,
                        },
                    },
                }),
            };
            const app = makeApp({ httpClient, developerId });
            const res = await (0, supertest_1.default)(app).get(`/v1/jobs/${jobId}/result`);
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.output_type).toBe('text');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('content');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('tokens_generated');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('model');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('finish_reason');
            (0, vitest_1.expect)(res.body.result.content).toBe(content);
            (0, vitest_1.expect)(res.body.result.tokens_generated).toBe(tokensGenerated);
            (0, vitest_1.expect)(res.body.result.model).toBe(modelName);
            (0, vitest_1.expect)(res.body.result.finish_reason).toBe(finishReason);
            // Cleanup
            jobs_1.jobOwnershipStore.delete(jobId);
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)('image jobs return image_urls, expires_at, width, height', async () => {
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.hexaString({ minLength: 24, maxLength: 24 }), fast_check_1.default.array(fast_check_1.default.webUrl(), { minLength: 1, maxLength: 4 }), fast_check_1.default.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') }), fast_check_1.default.nat({ max: 4096 }).filter(n => n > 0), fast_check_1.default.nat({ max: 4096 }).filter(n => n > 0), async (jobIdSuffix, imageUrls, expiresDate, width, height) => {
            const jobId = `job_${jobIdSuffix}`;
            const developerId = 'dev_prop12_image';
            const expiresAt = expiresDate.toISOString();
            // Setup ownership with image output type
            jobs_1.jobOwnershipStore.set(jobId, {
                job_id: jobId,
                developer_id: developerId,
                tier: 'T3',
                estimated_cost_usd: '5.000000',
                output_type: 'image',
                created_at: new Date().toISOString(),
            });
            const httpClient = {
                post: vitest_1.vi.fn(),
                get: vitest_1.vi.fn().mockResolvedValue({
                    status: 200,
                    data: {
                        job_id: jobId,
                        status: 'complete',
                        retries: 0,
                        result: {
                            image_urls: imageUrls,
                            expires_at: expiresAt,
                            width,
                            height,
                        },
                    },
                }),
            };
            const app = makeApp({ httpClient, developerId });
            const res = await (0, supertest_1.default)(app).get(`/v1/jobs/${jobId}/result`);
            (0, vitest_1.expect)(res.status).toBe(200);
            (0, vitest_1.expect)(res.body.output_type).toBe('image');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('image_urls');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('expires_at');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('width');
            (0, vitest_1.expect)(res.body.result).toHaveProperty('height');
            (0, vitest_1.expect)(res.body.result.image_urls).toEqual(imageUrls);
            (0, vitest_1.expect)(res.body.result.expires_at).toBe(expiresAt);
            (0, vitest_1.expect)(res.body.result.width).toBe(width);
            (0, vitest_1.expect)(res.body.result.height).toBe(height);
            // Cleanup
            jobs_1.jobOwnershipStore.delete(jobId);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=result.property.test.js.map