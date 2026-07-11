/**
 * Property 14: Model Registry Listing Completeness
 * Verify response contains every model from registry and total equals models returned count.
 *
 * **Validates: Requirements 5.1, 5.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as fc from 'fast-check';
import {
  createModelsRouter,
  resetModelRegistry,
  ModelRegistry,
  ModelListItem,
  ModelsResponse,
} from './models';

const REGISTRY_PATH = path.resolve(__dirname, '../../../../model_registry.yaml');

describe('Feature: neuralgrid-mvp, Property 14: Model Registry Listing Completeness', () => {
  let app: express.Application;
  let registry: ModelRegistry;
  let modelIds: string[];

  beforeEach(() => {
    resetModelRegistry();
    app = express();
    app.use(express.json());
    app.use(createModelsRouter({ registryPath: REGISTRY_PATH }));

    const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    registry = yaml.load(raw) as ModelRegistry;
    modelIds = Object.keys(registry.models);
  });

  afterEach(() => {
    resetModelRegistry();
  });

  it('total field equals number of models returned in array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const res = await request(app).get('/v1/models');
          expect(res.status).toBe(200);

          const body: ModelsResponse = res.body;
          expect(body.total).toBe(body.models.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('total equals number of models in YAML registry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const res = await request(app).get('/v1/models');
          expect(res.status).toBe(200);

          const body: ModelsResponse = res.body;
          expect(body.total).toBe(modelIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('every randomly sampled model ID from registry appears in response with correct fields', async () => {
    // Generate random non-empty subsets of model IDs
    const subsetArb = fc
      .subarray(modelIds, { minLength: 1, maxLength: modelIds.length })
      .filter((arr) => arr.length > 0);

    await fc.assert(
      fc.asyncProperty(subsetArb, async (sampledIds: string[]) => {
        const res = await request(app).get('/v1/models');
        expect(res.status).toBe(200);

        const body: ModelsResponse = res.body;
        const responseIds = body.models.map((m: ModelListItem) => m.id);

        for (const id of sampledIds) {
          // Model must be present in response
          expect(responseIds).toContain(id);

          const model = body.models.find((m: ModelListItem) => m.id === id)!;
          const entry = registry.models[id];

          // Required fields exist and are correct types
          expect(typeof model.id).toBe('string');
          expect(typeof model.family).toBe('string');
          expect(['T1', 'T2', 'T3']).toContain(model.default_tier);
          expect(Array.isArray(model.supported_quantizations)).toBe(true);
          expect(Array.isArray(model.input_types)).toBe(true);
          expect(Array.isArray(model.output_types)).toBe(true);

          // Values match registry
          expect(model.family).toBe(entry.family);
          expect(model.default_tier).toBe(entry.tier);
          expect(model.supported_quantizations).toEqual(Object.keys(entry.vram_gb));
          expect(model.input_types).toEqual(entry.input_types);
          expect(model.output_types).toEqual(entry.output_types);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('no extra models in response beyond what registry contains', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const res = await request(app).get('/v1/models');
          expect(res.status).toBe(200);

          const body: ModelsResponse = res.body;
          const responseIds = body.models.map((m: ModelListItem) => m.id);

          // Every response ID must be in registry
          for (const id of responseIds) {
            expect(modelIds).toContain(id);
          }

          // No duplicates
          const uniqueIds = new Set(responseIds);
          expect(uniqueIds.size).toBe(responseIds.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
