/**
 * Models listing endpoint — GET /v1/models
 * Returns all models from the registry with metadata.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { Tier } from '@neuralgrid/shared';

// --- Registry types (mirrors compute-estimator) ---

export interface ModelEntry {
  family: string;
  params_billions?: number;
  default_quantization: string;
  vram_gb: Record<string, number>;
  tier: Tier;
  input_types: string[];
  output_types: string[];
  notes?: string;
}

export interface ModelRegistry {
  models: Record<string, ModelEntry>;
}

export interface ModelListItem {
  id: string;
  family: string;
  default_tier: Tier;
  supported_quantizations: string[];
  input_types: string[];
  output_types: string[];
}

export interface ModelsResponse {
  models: ModelListItem[];
  total: number;
}

// --- Registry loader ---

let cachedRegistry: ModelRegistry | null = null;

export function loadModelRegistry(filePath?: string): ModelRegistry {
  if (cachedRegistry) return cachedRegistry;

  const resolvedPath =
    filePath || path.resolve(__dirname, '../../../../model_registry.yaml');

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = yaml.load(raw) as ModelRegistry;

  if (!parsed || !parsed.models) {
    throw new Error("Invalid model registry: missing 'models' key");
  }

  cachedRegistry = parsed;
  return cachedRegistry;
}

export function resetModelRegistry(): void {
  cachedRegistry = null;
}

// --- Router factory ---

export interface ModelsRouterDeps {
  registryPath?: string;
}

export function createModelsRouter(deps: ModelsRouterDeps = {}): Router {
  const router = Router();

  router.get('/v1/models', (_req: Request, res: Response): void => {
    try {
      const registry = loadModelRegistry(deps.registryPath);

      const models: ModelListItem[] = Object.entries(registry.models).map(
        ([id, entry]) => ({
          id,
          family: entry.family,
          default_tier: entry.tier,
          supported_quantizations: Object.keys(entry.vram_gb),
          input_types: entry.input_types,
          output_types: entry.output_types,
        })
      );

      const response: ModelsResponse = {
        models,
        total: models.length,
      };

      res.status(200).json(response);
    } catch (err) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to load model registry',
        },
      });
    }
  });

  return router;
}
