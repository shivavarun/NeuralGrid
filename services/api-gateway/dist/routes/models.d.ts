/**
 * Models listing endpoint — GET /v1/models
 * Returns all models from the registry with metadata.
 */
import { Router } from 'express';
import type { Tier } from '@neuralgrid/shared';
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
export declare function loadModelRegistry(filePath?: string): ModelRegistry;
export declare function resetModelRegistry(): void;
export interface ModelsRouterDeps {
    registryPath?: string;
}
export declare function createModelsRouter(deps?: ModelsRouterDeps): Router;
