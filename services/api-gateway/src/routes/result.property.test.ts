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

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import { createJobsRouter, jobOwnershipStore, JobOwnership, HttpClient } from './jobs';

function makeApp(deps: { httpClient: HttpClient; developerId: string }) {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware
  app.use((req, _res, next) => {
    (req as any).developerId = deps.developerId;
    next();
  });

  const router = createJobsRouter({ httpClient: deps.httpClient });
  app.use(router);

  return app;
}

describe('Property 11: Result Availability Gate', () => {
  it('returns 409 JOB_NOT_COMPLETE for any non-complete status', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random non-complete statuses
        fc.constantFrom('queued', 'running', 'failed'),
        // Generate random job ID suffix
        fc.hexaString({ minLength: 24, maxLength: 24 }),
        async (status, jobIdSuffix) => {
          const jobId = `job_${jobIdSuffix}`;
          const developerId = 'dev_prop11';

          // Setup ownership store
          jobOwnershipStore.set(jobId, {
            job_id: jobId,
            developer_id: developerId,
            tier: 'T1',
            estimated_cost_usd: '1.000000',
            output_type: 'text',
            created_at: new Date().toISOString(),
          });

          const httpClient: HttpClient = {
            post: vi.fn(),
            get: vi.fn().mockResolvedValue({
              status: 200,
              data: {
                job_id: jobId,
                status,
                retries: 0,
              },
            }),
          };

          const app = makeApp({ httpClient, developerId });
          const res = await request(app).get(`/v1/jobs/${jobId}/result`);

          expect(res.status).toBe(409);
          expect(res.body.error.code).toBe('JOB_NOT_COMPLETE');
          expect(res.body.error.details.current_status).toBe(status);

          // Cleanup
          jobOwnershipStore.delete(jobId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 12: Result Shape by Output Type', () => {
  it('text jobs return content, tokens_generated, model, finish_reason', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 24, maxLength: 24 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.nat({ max: 10000 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.constantFrom('stop' as const, 'length' as const, 'error' as const),
        async (jobIdSuffix, content, tokensGenerated, modelName, finishReason) => {
          const jobId = `job_${jobIdSuffix}`;
          const developerId = 'dev_prop12_text';

          // Setup ownership with text output type
          jobOwnershipStore.set(jobId, {
            job_id: jobId,
            developer_id: developerId,
            tier: 'T2',
            estimated_cost_usd: '2.500000',
            output_type: 'text',
            created_at: new Date().toISOString(),
          });

          const httpClient: HttpClient = {
            post: vi.fn(),
            get: vi.fn().mockResolvedValue({
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
          const res = await request(app).get(`/v1/jobs/${jobId}/result`);

          expect(res.status).toBe(200);
          expect(res.body.output_type).toBe('text');
          expect(res.body.result).toHaveProperty('content');
          expect(res.body.result).toHaveProperty('tokens_generated');
          expect(res.body.result).toHaveProperty('model');
          expect(res.body.result).toHaveProperty('finish_reason');
          expect(res.body.result.content).toBe(content);
          expect(res.body.result.tokens_generated).toBe(tokensGenerated);
          expect(res.body.result.model).toBe(modelName);
          expect(res.body.result.finish_reason).toBe(finishReason);

          // Cleanup
          jobOwnershipStore.delete(jobId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('image jobs return image_urls, expires_at, width, height', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.hexaString({ minLength: 24, maxLength: 24 }),
        fc.array(fc.webUrl(), { minLength: 1, maxLength: 4 }),
        fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') }),
        fc.nat({ max: 4096 }).filter(n => n > 0),
        fc.nat({ max: 4096 }).filter(n => n > 0),
        async (jobIdSuffix, imageUrls, expiresDate, width, height) => {
          const jobId = `job_${jobIdSuffix}`;
          const developerId = 'dev_prop12_image';
          const expiresAt = expiresDate.toISOString();

          // Setup ownership with image output type
          jobOwnershipStore.set(jobId, {
            job_id: jobId,
            developer_id: developerId,
            tier: 'T3',
            estimated_cost_usd: '5.000000',
            output_type: 'image',
            created_at: new Date().toISOString(),
          });

          const httpClient: HttpClient = {
            post: vi.fn(),
            get: vi.fn().mockResolvedValue({
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
          const res = await request(app).get(`/v1/jobs/${jobId}/result`);

          expect(res.status).toBe(200);
          expect(res.body.output_type).toBe('image');
          expect(res.body.result).toHaveProperty('image_urls');
          expect(res.body.result).toHaveProperty('expires_at');
          expect(res.body.result).toHaveProperty('width');
          expect(res.body.result).toHaveProperty('height');
          expect(res.body.result.image_urls).toEqual(imageUrls);
          expect(res.body.result.expires_at).toBe(expiresAt);
          expect(res.body.result.width).toBe(width);
          expect(res.body.result.height).toBe(height);

          // Cleanup
          jobOwnershipStore.delete(jobId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
