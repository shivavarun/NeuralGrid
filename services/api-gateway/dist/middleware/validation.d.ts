/**
 * Input validation middleware for job submission (POST /v1/jobs).
 * Validates required fields, model existence, quantization, and input type.
 */
import { Request, Response, NextFunction } from "express";
import type { Quantization } from "@neuralgrid/shared";
/**
 * Model entry shape needed for validation.
 * Mirrors compute-estimator registry's ModelEntry.
 */
export interface ModelEntry {
    family: string;
    params_billions?: number;
    default_quantization: Quantization;
    vram_gb: Partial<Record<Quantization, number>>;
    tier: string;
    input_types: string[];
    output_types: string[];
    notes?: string;
}
export type ModelLookup = (id: string) => ModelEntry | undefined;
/**
 * Factory: creates validation middleware with injectable model lookup.
 * This allows unit testing without loading YAML from disk.
 */
export declare function createValidationMiddleware(getModel: ModelLookup): (req: Request, res: Response, next: NextFunction) => void;
