/**
 * Property 8: Budget Exceeded Detection
 * For any job where estimated_cost > developer.max_cost_usd, verify 400 BUDGET_EXCEEDED.
 *
 * Validates: Requirements 1.4
 * Feature: neuralgrid-mvp, Property 8: Budget Exceeded Detection
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import { createJobsRouter, DeveloperRecord, HttpClient } from './jobs';

function makeApp(deps: {
  developer: DeveloperRecord;
  httpClient: HttpClient;
}) {
  const app = express();
  app.use(express.json());

  // Simulate auth middleware
  app.use((req, _res, next) => {
    (req as any).developerId = deps.developer.id;
    next();
  });

  const getDeveloper = vi.fn().mockResolvedValue(deps.developer);
  const router = createJobsRouter({ getDeveloper, httpClient: deps.httpClient });
  app.use(router);

  return app;
}

const validBody = {
  model: 'llama-3-8b',
  input: { type: 'text', content: 'Hello' },
  output: { type: 'text', max_tokens: 100 },
};

describe('Property 8: Budget Exceeded Detection', () => {
  it('returns 400 BUDGET_EXCEEDED when estimated_cost > max_cost_usd', async () => {
    await fc.assert(
      fc.asyncProperty(
        // max_cost_usd: positive float 0.01-100
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true }),
        // delta: positive amount that cost exceeds budget
        fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
        async (maxCost, delta) => {
          const estimatedCost = maxCost + delta;

          const developer: DeveloperRecord = {
            id: 'dev_prop8',
            max_cost_usd: maxCost,
            payment_status: 'active',
          };

          const httpClient: HttpClient = {
            post: vi.fn().mockResolvedValue({
              status: 200,
              data: {
                tier: 'T1',
                min_vram_gb: 10,
                estimated_runtime_seconds: 30,
                estimated_cost_usd: estimatedCost.toFixed(6),
                confidence: 'HIGH',
              },
            }),
            get: vi.fn(),
          };

          const app = makeApp({ developer, httpClient });
          const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

          expect(res.status).toBe(400);
          expect(res.body.error.code).toBe('BUDGET_EXCEEDED');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does NOT return BUDGET_EXCEEDED when estimated_cost <= max_cost_usd', async () => {
    await fc.assert(
      fc.asyncProperty(
        // max_cost_usd: positive float 1-100
        fc.float({ min: Math.fround(1), max: Math.fround(100), noNaN: true }),
        // ratio: 0 to 1 so cost <= max
        fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
        async (maxCost, ratio) => {
          const estimatedCost = maxCost * ratio;

          const developer: DeveloperRecord = {
            id: 'dev_prop8_inv',
            max_cost_usd: maxCost,
            payment_status: 'active',
          };

          const mockNode = {
            provider: 'vastai',
            node_id: 'v1',
            gpu_model: 'RTX 3090',
            vram_gb: 24,
            hourly_rate_usd: 0.3,
            availability: true,
          };

          const httpClient: HttpClient = {
            post: vi.fn()
              .mockResolvedValueOnce({
                status: 200,
                data: {
                  tier: 'T1',
                  min_vram_gb: 10,
                  estimated_runtime_seconds: 30,
                  estimated_cost_usd: estimatedCost.toFixed(6),
                  confidence: 'HIGH',
                },
              })
              .mockResolvedValueOnce({ status: 202, data: {} }), // dispatch
            get: vi.fn().mockResolvedValue({
              status: 200,
              data: {
                nodes: [mockNode],
                cached: false,
                cache_age_seconds: 0,
              },
            }),
          };

          const app = makeApp({ developer, httpClient });
          const res = await request(app).post('/v1/jobs').set('Idempotency-Key', `k-${Date.now()}-${Math.random()}`).send(validBody);

          // Should NOT be BUDGET_EXCEEDED
          expect(res.status).not.toBe(400);
          if (res.body.error) {
            expect(res.body.error.code).not.toBe('BUDGET_EXCEEDED');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
