import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import {
  createModelsRouter,
  resetModelRegistry,
  loadModelRegistry,
  ModelRegistry,
} from './models';

const REGISTRY_PATH = path.resolve(__dirname, '../../../../model_registry.yaml');

describe('GET /v1/models', () => {
  let app: express.Application;

  beforeEach(() => {
    resetModelRegistry();
    app = express();
    app.use(express.json());
    app.use(createModelsRouter({ registryPath: REGISTRY_PATH }));
  });

  afterEach(() => {
    resetModelRegistry();
  });

  it('returns 200 with models array and total count', async () => {
    const res = await request(app).get('/v1/models');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('models');
    expect(res.body).toHaveProperty('total');
    expect(Array.isArray(res.body.models)).toBe(true);
    expect(res.body.total).toBe(res.body.models.length);
  });

  it('total matches number of models in registry YAML', async () => {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const parsed = yaml.load(raw) as ModelRegistry;
    const expectedCount = Object.keys(parsed.models).length;

    const res = await request(app).get('/v1/models');

    expect(res.body.total).toBe(expectedCount);
  });

  it('each model has required fields: id, family, default_tier, supported_quantizations, input_types, output_types', async () => {
    const res = await request(app).get('/v1/models');

    for (const model of res.body.models) {
      expect(model).toHaveProperty('id');
      expect(model).toHaveProperty('family');
      expect(model).toHaveProperty('default_tier');
      expect(model).toHaveProperty('supported_quantizations');
      expect(model).toHaveProperty('input_types');
      expect(model).toHaveProperty('output_types');
      expect(typeof model.id).toBe('string');
      expect(typeof model.family).toBe('string');
      expect(['T1', 'T2', 'T3']).toContain(model.default_tier);
      expect(Array.isArray(model.supported_quantizations)).toBe(true);
      expect(Array.isArray(model.input_types)).toBe(true);
      expect(Array.isArray(model.output_types)).toBe(true);
    }
  });

  it('supported_quantizations are derived from vram_gb keys', async () => {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8');
    const parsed = yaml.load(raw) as ModelRegistry;

    const res = await request(app).get('/v1/models');

    for (const model of res.body.models) {
      const entry = parsed.models[model.id];
      const expectedQuants = Object.keys(entry.vram_gb);
      expect(model.supported_quantizations).toEqual(expectedQuants);
    }
  });

  it('includes known model llama-3-8b with correct data', async () => {
    const res = await request(app).get('/v1/models');

    const llama = res.body.models.find((m: any) => m.id === 'llama-3-8b');
    expect(llama).toBeDefined();
    expect(llama.family).toBe('llama');
    expect(llama.default_tier).toBe('T1');
    expect(llama.supported_quantizations).toEqual(['fp32', 'fp16', 'int8', 'int4']);
    expect(llama.input_types).toEqual(['text']);
    expect(llama.output_types).toEqual(['text']);
  });

  it('includes image model stable-diffusion-xl with correct types', async () => {
    const res = await request(app).get('/v1/models');

    const sdxl = res.body.models.find((m: any) => m.id === 'stable-diffusion-xl');
    expect(sdxl).toBeDefined();
    expect(sdxl.family).toBe('diffusion');
    expect(sdxl.default_tier).toBe('T2');
    expect(sdxl.input_types).toEqual(['text', 'image']);
    expect(sdxl.output_types).toEqual(['image']);
  });

  it('returns 500 when registry file is missing', async () => {
    resetModelRegistry();
    const badApp = express();
    badApp.use(createModelsRouter({ registryPath: '/nonexistent/path.yaml' }));

    const res = await request(badApp).get('/v1/models');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
