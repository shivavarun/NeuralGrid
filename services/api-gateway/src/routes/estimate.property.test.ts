/**
 * Property 13: Cost Estimate Response Completeness
 * For any valid estimate request, the response SHALL contain tier, min_vram_gb,
 * estimated_runtime_seconds, estimated_cost_usd, confidence, and a vs_runpod_a100
 * comparison where saving_pct = (runpod_cost - estimated_cost) / runpod_cost × 100.
 *
 * Validates: Requirements 4.1, 4.2
 * Feature: neuralgrid-mvp, Property 13: Cost Estimate Response Completeness
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import express from 'express';
import request from 'supertest';
import {
  createEstimateRouter,
  HttpClient,
  RUNPOD_A100_RATE_PER_HOUR,
} from './estimate';

// Valid model IDs from registry
const VALID_MODELS = [
  'llama-3-8b', 'llama-3-13b', 'llama-3-70b',
  'mistral-7b', 'mixtral-8x7b', 'gemma-7b',
  'phi-3-mini', 'qwen2-7b', 'stable-diffusion-xl',
];

const TIERS = ['T1', 'T2', 'T3'] as const;
const CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;

function makeApp(httpClient: HttpClient) {
  const app = express();
  app.use(express.json());
  const router = createEstimateRouter({ httpClient });
  app.use(router);
  return app;
}

describe('Property 13: Cost Estimate Response Completeness', () => {
  it('response contains all required fields for any valid estimate', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_MODELS),
        fc.constantFrom(...TIERS),
        fc.constantFrom(...CONFIDENCES),
        fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),  // min_vram_gb
        fc.float({ min: Math.fround(1), max: Math.fround(3600), noNaN: true }),   // runtime_seconds
        fc.float({ min: Math.fround(0.0001), max: Math.fround(5), noNaN: true }), // estimated_cost
        async (modelId, tier, confidence, minVram, runtimeSeconds, estimatedCost) => {
          const costStr = estimatedCost.toFixed(6);

          const httpClient: HttpClient = {
            post: vi.fn().mockResolvedValue({
              status: 200,
              data: {
                tier,
                min_vram_gb: minVram,
                estimated_runtime_seconds: runtimeSeconds,
                estimated_cost_usd: costStr,
                confidence,
              },
            }),
          };

          const app = makeApp(httpClient);
          const res = await request(app)
            .get(`/v1/models/${modelId}/estimate`)
            .query({ input_tokens: 1000, max_tokens: 500 });

          // Must be 200
          expect(res.status).toBe(200);

          const body = res.body;

          // All required fields present
          expect(body).toHaveProperty('tier');
          expect(body).toHaveProperty('min_vram_gb');
          expect(body).toHaveProperty('estimated_runtime_seconds');
          expect(body).toHaveProperty('estimated_cost_usd');
          expect(body).toHaveProperty('confidence');
          expect(body).toHaveProperty('vs_runpod_a100');

          // Field values match input
          expect(body.tier).toBe(tier);
          expect(body.min_vram_gb).toBe(minVram);
          expect(body.estimated_runtime_seconds).toBe(runtimeSeconds);
          expect(body.estimated_cost_usd).toBe(costStr);
          expect(body.confidence).toBe(confidence);

          // vs_runpod_a100 sub-fields
          expect(body.vs_runpod_a100).toHaveProperty('runpod_cost_usd');
          expect(body.vs_runpod_a100).toHaveProperty('saving_pct');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('saving_pct = (runpod_cost - estimated_cost) / runpod_cost × 100', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...VALID_MODELS),
        fc.constantFrom(...TIERS),
        fc.float({ min: Math.fround(10), max: Math.fround(3600), noNaN: true }),   // runtime_seconds (min 10 to avoid near-zero division)
        fc.float({ min: Math.fround(0.0001), max: Math.fround(5), noNaN: true }),  // estimated_cost
        async (modelId, tier, runtimeSeconds, estimatedCost) => {
          const costStr = estimatedCost.toFixed(6);

          const httpClient: HttpClient = {
            post: vi.fn().mockResolvedValue({
              status: 200,
              data: {
                tier,
                min_vram_gb: 10,
                estimated_runtime_seconds: runtimeSeconds,
                estimated_cost_usd: costStr,
                confidence: 'HIGH',
              },
            }),
          };

          const app = makeApp(httpClient);
          const res = await request(app)
            .get(`/v1/models/${modelId}/estimate`)
            .query({ input_tokens: 1000, max_tokens: 500 });

          expect(res.status).toBe(200);

          const body = res.body;
          const runpodCost = RUNPOD_A100_RATE_PER_HOUR * (runtimeSeconds / 3600);
          const expectedSavingPct = ((runpodCost - estimatedCost) / runpodCost) * 100;
          const expectedRounded = Math.round(expectedSavingPct * 100) / 100;

          expect(body.vs_runpod_a100.saving_pct).toBeCloseTo(expectedRounded, 1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
