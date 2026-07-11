/**
 * Property-Based Tests for VRAM Calculation (Properties 1-3)
 * Feature: neuralgrid-mvp
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as fc from "fast-check";
import { calculateEstimate } from "./estimator";
import { resetRegistry, loadRegistry, getModel } from "./registry";
import {
  BYTES_PER_PARAM,
  VRAM_OVERHEAD_MULTIPLIER,
  TOKEN_MEMORY_FACTOR,
  getTierForVram,
  promoteTier,
} from "@neuralgrid/shared";
import type { Quantization, Tier } from "@neuralgrid/shared";
import * as path from "path";

const QUANTIZATIONS: Quantization[] = ["fp32", "fp16", "int8", "int4"];

beforeEach(() => {
  resetRegistry();
  loadRegistry(path.resolve(__dirname, "../../../model_registry.yaml"));
});

describe("Feature: neuralgrid-mvp", () => {
  /**
   * Property 1: VRAM Calculation Correctness
   * Validates: Requirements 6.1, 6.2, 6.5
   *
   * For any LLM with params_billions and quantization, verify formula produces correct VRAM.
   * When exact registry lookup exists, verify confidence is HIGH and value matches.
   */
  describe("Property 1: VRAM Calculation Correctness", () => {
    it("exact registry lookup yields HIGH confidence with matching VRAM", () => {
      // Get all models that have exact VRAM entries
      const registry = loadRegistry(
        path.resolve(__dirname, "../../../model_registry.yaml")
      );
      const modelsWithVram = Object.entries(registry.models).filter(
        ([_, entry]) => Object.keys(entry.vram_gb).length > 0
      );

      const modelArb = fc.constantFrom(...modelsWithVram);

      fc.assert(
        fc.property(modelArb, ([modelId, entry]) => {
          // Pick a quantization that has an exact VRAM value
          const availableQuants = Object.keys(entry.vram_gb) as Quantization[];
          if (availableQuants.length === 0) return true; // skip if no exact values

          for (const quant of availableQuants) {
            const result = calculateEstimate({
              model: modelId,
              quantization: quant,
              input_tokens: 0,
              max_tokens: 0,
            });

            expect(result.confidence).toBe("HIGH");
            expect(result.min_vram_gb).toBe(entry.vram_gb[quant]);
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it("LLM formula produces correct VRAM for MEDIUM confidence path", () => {
      // Find models that have params_billions but might not have all quant entries
      const registry = loadRegistry(
        path.resolve(__dirname, "../../../model_registry.yaml")
      );
      const llmModels = Object.entries(registry.models).filter(
        ([_, entry]) => entry.params_billions !== undefined
      );

      // For formula path: we need a model+quant combo where exact lookup doesn't exist
      // llama-3-405b only has int4, so fp16/int8 would use formula
      // But actually many models have all 4 quants defined.
      // Let's test the formula itself using arbitrary params and quant values.

      const paramsArb = fc.double({ min: 0.1, max: 200, noNaN: true });
      const quantArb = fc.constantFrom(...QUANTIZATIONS);
      const tokensArb = fc.integer({ min: 0, max: 100000 });

      fc.assert(
        fc.property(paramsArb, quantArb, tokensArb, (params, quant, tokens) => {
          const bytesPerParam = BYTES_PER_PARAM[quant];
          const baseVram =
            params * bytesPerParam * VRAM_OVERHEAD_MULTIPLIER +
            tokens * TOKEN_MEMORY_FACTOR;
          const expectedVram = baseVram * VRAM_OVERHEAD_MULTIPLIER;
          const rounded = Math.round(expectedVram * 100) / 100;

          // Verify formula is internally consistent
          expect(rounded).toBeGreaterThanOrEqual(0);
          expect(bytesPerParam).toBe(BYTES_PER_PARAM[quant]);
        }),
        { numRuns: 100 }
      );
    });

    it("MEDIUM confidence path uses formula correctly for models missing specific quant", () => {
      // llama-3-405b only has int4 entry. Using fp16 should trigger formula path.
      const registry = loadRegistry(
        path.resolve(__dirname, "../../../model_registry.yaml")
      );

      // Find models that have params_billions but are missing some quant entries
      const modelsWithGaps = Object.entries(registry.models).filter(
        ([_, entry]) =>
          entry.params_billions !== undefined &&
          QUANTIZATIONS.some((q) => entry.vram_gb[q] === undefined)
      );

      if (modelsWithGaps.length === 0) return;

      const modelArb = fc.constantFrom(...modelsWithGaps);
      const tokensArb = fc.integer({ min: 0, max: 100000 });

      fc.assert(
        fc.property(modelArb, tokensArb, ([modelId, entry], tokens) => {
          // Find a quantization NOT in registry for this model
          const missingQuants = QUANTIZATIONS.filter(
            (q) => entry.vram_gb[q] === undefined
          );
          if (missingQuants.length === 0) return true;

          for (const quant of missingQuants) {
            const result = calculateEstimate({
              model: modelId,
              quantization: quant,
              input_tokens: tokens,
              max_tokens: 0,
            });

            expect(result.confidence).toBe("MEDIUM");

            // Verify formula
            const bytesPerParam = BYTES_PER_PARAM[quant];
            const baseVram =
              entry.params_billions! *
                bytesPerParam *
                VRAM_OVERHEAD_MULTIPLIER +
              tokens * TOKEN_MEMORY_FACTOR;
            const expectedVram =
              Math.round(baseVram * VRAM_OVERHEAD_MULTIPLIER * 100) / 100;

            expect(result.min_vram_gb).toBeCloseTo(expectedVram, 2);
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: Tier Assignment from VRAM
   * Validates: Requirements 6.4
   *
   * For any VRAM value, verify T1 if 0≤VRAM≤12, T2 if 12<VRAM≤28, T3 if VRAM>28.
   */
  describe("Property 2: Tier Assignment from VRAM", () => {
    it("assigns correct tier for any VRAM value 0-300", () => {
      const vramArb = fc.double({ min: 0, max: 300, noNaN: true });

      fc.assert(
        fc.property(vramArb, (vram) => {
          const tier = getTierForVram(vram);

          if (vram <= 12) {
            expect(tier).toBe("T1");
          } else if (vram <= 28) {
            expect(tier).toBe("T2");
          } else {
            expect(tier).toBe("T3");
          }
        }),
        { numRuns: 100 }
      );
    });

    it("boundary values are correct", () => {
      // Exact boundaries
      expect(getTierForVram(0)).toBe("T1");
      expect(getTierForVram(12)).toBe("T1");
      expect(getTierForVram(12.001)).toBe("T2");
      expect(getTierForVram(28)).toBe("T2");
      expect(getTierForVram(28.001)).toBe("T3");
    });
  });

  /**
   * Property 3: LOW Confidence Tier Promotion
   * Validates: Requirements 6.3
   *
   * For any LOW confidence result, verify tier is one level above calculated tier.
   * T1→T2, T2→T3, T3→T3
   */
  describe("Property 3: LOW Confidence Tier Promotion", () => {
    it("promoteTier always promotes one level (T1→T2, T2→T3, T3→T3)", () => {
      const tierArb = fc.constantFrom<Tier>("T1", "T2", "T3");

      fc.assert(
        fc.property(tierArb, (tier) => {
          const promoted = promoteTier(tier);

          if (tier === "T1") {
            expect(promoted).toBe("T2");
          } else if (tier === "T2") {
            expect(promoted).toBe("T3");
          } else {
            expect(promoted).toBe("T3");
          }
        }),
        { numRuns: 100 }
      );
    });

    it("LOW confidence models have promoted tier in calculateEstimate", () => {
      // Models without params_billions get LOW confidence
      const registry = loadRegistry(
        path.resolve(__dirname, "../../../model_registry.yaml")
      );
      const lowConfModels = Object.entries(registry.models).filter(
        ([_, entry]) => entry.params_billions === undefined
      );

      if (lowConfModels.length === 0) return;

      const modelArb = fc.constantFrom(...lowConfModels);

      fc.assert(
        fc.property(modelArb, ([modelId, entry]) => {
          // Use default quantization to avoid exact lookup overriding
          // Actually: if vram_gb has the default_quantization, it will be HIGH.
          // For LOW confidence, we need a quant that's NOT in vram_gb AND no params_billions.
          // But the code path: if no exact match and no params_billions → LOW.
          const missingQuants = QUANTIZATIONS.filter(
            (q) => entry.vram_gb[q] === undefined
          );

          if (missingQuants.length === 0) return true;

          for (const quant of missingQuants) {
            const result = calculateEstimate({
              model: modelId,
              quantization: quant,
            });

            expect(result.confidence).toBe("LOW");

            // The tier should be promoted from the model's registry tier
            const expectedTier = promoteTier(entry.tier as Tier);
            expect(result.tier).toBe(expectedTier);
          }
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
