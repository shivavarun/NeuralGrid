/**
 * VRAM Calculation and Tier Assignment
 * Implements compute estimation logic for NeuralGrid.
 */

import type {
  EstimateRequest,
  EstimateResponse,
  Confidence,
  Tier,
  Quantization,
} from "@neuralgrid/shared";

import {
  BYTES_PER_PARAM,
  VRAM_OVERHEAD_MULTIPLIER,
  TOKEN_MEMORY_FACTOR,
  getTierForVram,
  promoteTier,
} from "@neuralgrid/shared";

import { getModel } from "./registry";

/**
 * Calculate VRAM estimate, tier, and confidence for a given model request.
 *
 * Logic:
 * 1. Exact registry lookup → confidence HIGH
 * 2. LLM formula (has params_billions) → confidence MEDIUM
 * 3. No params_billions (image/audio models) → use default tier, confidence LOW
 * 4. If LOW confidence → promote tier one level up
 */
export function calculateEstimate(request: EstimateRequest): EstimateResponse {
  const model = getModel(request.model);

  if (!model) {
    throw new Error(`Model not found: ${request.model}`);
  }

  const quantization: Quantization =
    request.quantization ?? model.default_quantization;
  const tokens = (request.input_tokens ?? 0) + (request.max_tokens ?? 0);

  let vram_gb: number;
  let confidence: Confidence;
  let tier: Tier;

  // Path 1: Exact registry lookup
  if (model.vram_gb[quantization] !== undefined) {
    vram_gb = model.vram_gb[quantization]!;
    confidence = "HIGH";
    tier = getTierForVram(vram_gb);
  }
  // Path 2: LLM formula (has params_billions but no exact VRAM for this quantization)
  else if (model.params_billions !== undefined) {
    const bytesPerParam = BYTES_PER_PARAM[quantization];
    const baseVram =
      model.params_billions * bytesPerParam * VRAM_OVERHEAD_MULTIPLIER +
      tokens * TOKEN_MEMORY_FACTOR;
    // Apply 20% buffer for MEDIUM confidence
    vram_gb = baseVram * VRAM_OVERHEAD_MULTIPLIER;
    confidence = "MEDIUM";
    tier = getTierForVram(vram_gb);
  }
  // Path 3: No params_billions — use default tier from registry, confidence LOW
  else {
    vram_gb = model.vram_gb[model.default_quantization] ?? 0;
    confidence = "LOW";
    tier = model.tier;
  }

  // LOW confidence → promote tier one level up
  if (confidence === "LOW") {
    tier = promoteTier(tier);
  }

  return {
    tier,
    min_vram_gb: Math.round(vram_gb * 100) / 100,
    estimated_runtime_seconds: 0, // Placeholder — computed by server route
    estimated_cost_usd: "0.00", // Placeholder — computed by server route
    confidence,
  };
}
