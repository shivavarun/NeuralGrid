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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import { createJobsRouter, jobOwnershipStore, HttpClient, JobOwnership } from './jobs';

const VALID_STATUSES = ['queued', 'running', 'complete', 'failed'] as const;

function makeApp(deps: { developerId: string; httpClient: HttpClient }) {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware — sets developerId on request
  app.use((req, _res, next) => {
    (req as any).developerId = deps.developerId;
    next();
  });

  const router = createJobsRouter({ httpClient: deps.httpClient });
  app.use(router);

  return app;
}

function seedJob(jobId: string, developerId: string): void {
  jobOwnershipStore.set(jobId, {
    job_id: jobId,
    developer_id: developerId,
    tier: 'T1',
    estimated_cost_usd: '1.00',
    output_type: 'text',
    created_at: new Date().toISOString(),
  });
}

describe('Property 9: Job Status Value Invariant', () => {
  beforeEach(() => {
    jobOwnershipStore.clear();
  });

  /**
   * Validates: Requirements 2.3
   *
   * For any status value returned by Job_Scheduler, the GET /v1/jobs/:id
   * response status field is always one of: queued, running, complete, failed.
   */
  it('response status is always one of queued|running|complete|failed', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random status from valid set
        fc.constantFrom(...VALID_STATUSES),
        // Random job ID suffix
        fc.hexaString({ minLength: 8, maxLength: 24 }),
        async (schedulerStatus, idSuffix) => {
          const jobId = `job_${idSuffix}`;
          const devId = 'dev_prop9';

          seedJob(jobId, devId);

          const httpClient: HttpClient = {
            post: vi.fn(),
            get: vi.fn().mockResolvedValue({
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
          const res = await request(app).get(`/v1/jobs/${jobId}`);

          expect(res.status).toBe(200);
          expect(VALID_STATUSES).toContain(res.body.status);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: Job Isolation', () => {
  beforeEach(() => {
    jobOwnershipStore.clear();
  });

  /**
   * Validates: Requirements 2.2
   *
   * For any job belonging to dev_A, a request from dev_B (different developer)
   * always gets 404 JOB_NOT_FOUND.
   */
  it('returns 404 JOB_NOT_FOUND when job belongs to different developer', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Owner developer ID
        fc.string({ minLength: 3, maxLength: 20 }).map((s) => `dev_owner_${s}`),
        // Requester developer ID (always different)
        fc.string({ minLength: 3, maxLength: 20 }).map((s) => `dev_requester_${s}`),
        // Random job ID suffix
        fc.hexaString({ minLength: 8, maxLength: 24 }),
        async (ownerId, requesterId, idSuffix) => {
          // Ensure IDs are actually different
          fc.pre(ownerId !== requesterId);

          const jobId = `job_${idSuffix}`;

          seedJob(jobId, ownerId);

          const httpClient: HttpClient = {
            post: vi.fn(),
            get: vi.fn(), // Should never be called
          };

          const app = makeApp({ developerId: requesterId, httpClient });
          const res = await request(app).get(`/v1/jobs/${jobId}`);

          expect(res.status).toBe(404);
          expect(res.body.error.code).toBe('JOB_NOT_FOUND');

          // Ensure Job_Scheduler was never called (isolation at gateway level)
          expect(httpClient.get).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
