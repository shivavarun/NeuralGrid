/**
 * Model Registry Loader
 * Loads and parses model_registry.yaml, caches in memory.
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import type { Quantization, Tier } from "@neuralgrid/shared";

export interface ModelEntry {
  family: string;
  params_billions?: number;
  default_quantization: Quantization;
  vram_gb: Partial<Record<Quantization, number>>;
  tier: Tier;
  input_types: string[];
  output_types: string[];
  notes?: string;
}

export interface ModelRegistry {
  models: Record<string, ModelEntry>;
}

// In-memory cache
let registry: ModelRegistry | null = null;

/**
 * Load registry from YAML file. Caches result in memory.
 */
export function loadRegistry(filePath?: string): ModelRegistry {
  if (registry) return registry;

  const resolvedPath =
    filePath || path.resolve(__dirname, "../../../model_registry.yaml");

  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const parsed = yaml.load(raw) as ModelRegistry;

  if (!parsed || !parsed.models) {
    throw new Error("Invalid model registry: missing 'models' key");
  }

  registry = parsed;
  return registry;
}

/**
 * Get a single model by ID. Returns undefined if not found.
 */
export function getModel(id: string): ModelEntry | undefined {
  const reg = loadRegistry();
  return reg.models[id];
}

/**
 * Get all models as a record of id → ModelEntry.
 */
export function getAllModels(): Record<string, ModelEntry> {
  const reg = loadRegistry();
  return reg.models;
}

/**
 * Check if a model exists in the registry.
 */
export function modelExists(id: string): boolean {
  const reg = loadRegistry();
  return id in reg.models;
}

/**
 * Reset cached registry (useful for testing).
 */
export function resetRegistry(): void {
  registry = null;
}
