/**
 * Coverage-focused unit tests for Compute_Estimator (Req 22.1).
 *
 * Explicitly exercises the VRAM/Tier output for every supported quantization
 * (fp32, fp16, int8, int4) and every Confidence branch (HIGH, MEDIUM, LOW),
 * including the LOW-confidence tier promotion. Complements estimator.test.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { calculateEstimate } from "./estimator";
import { getModel, resetRegistry } from "./registry";
import {
  BYTES_PER_PARAM,
  VRAM_OVERHEAD_MULTIPLIER,
  TOKEN_MEMORY_FACTOR,
  getTierForVram,
  promoteTier,
  QUANTIZATION_VALUES,
} from "@neuralgrid/shared";
import type { Quantization } from "@neuralgrid/shared";

beforeEach(() => {
  resetRegistry();
});

describe("Req 22.1: HIGH confidence per quantization (exact registry lookup)", () => {
  // llama-3-8b defines all four quantizations in the registry.
  it.each<[Quantization, number]>([
    ["fp32", 38],
    ["fp16", 19],
    ["int8", 10],
    ["int4", 5],
  ])("llama-3-8b @ %s -> exact VRAM %d, HIGH confidence", (quant, vram) => {
    const r = calculateEstimate({ model: "llama-3-8b", quantization: quant });
    expect(r.confidence).toBe("HIGH");
    expect(r.min_vram_gb).toBe(vram);
    expect(r.tier).toBe(getTierForVram(vram));
  });
});

describe("Req 22.1: MEDIUM confidence per quantization (LLM formula)", () => {
  // llama-3-405b only defines int4, so fp32/fp16/int8 fall to the formula path.
  it.each<Quantization>(["fp32", "fp16", "int8"])(
    "llama-3-405b @ %s -> formula VRAM, MEDIUM confidence",
    (quant) => {
      const model = getModel("llama-3-405b")!;
      const r = calculateEstimate({
        model: "llama-3-405b",
        quantization: quant,
        input_tokens: 0,
        max_tokens: 0,
      });
      expect(r.confidence).toBe("MEDIUM");

      const base =
        model.params_billions! * BYTES_PER_PARAM[quant] * VRAM_OVERHEAD_MULTIPLIER +
        0 * TOKEN_MEMORY_FACTOR;
      const expected = Math.round(base * VRAM_OVERHEAD_MULTIPLIER * 100) / 100;
      expect(r.min_vram_gb).toBeCloseTo(expected, 2);
      expect(r.tier).toBe(getTierForVram(expected));
    }
  );

  it("int4 for llama-3-405b hits the exact-lookup HIGH path (control)", () => {
    const r = calculateEstimate({ model: "llama-3-405b", quantization: "int4" });
    expect(r.confidence).toBe("HIGH");
  });
});

describe("Req 22.1: LOW confidence per quantization (no params, tier promoted)", () => {
  // whisper-tiny (T1) and stable-diffusion-xl (T2) have no params_billions and
  // only define fp32/fp16, so int8/int4 take the LOW branch.
  it.each<[string, Quantization]>([
    ["whisper-tiny", "int8"],
    ["whisper-tiny", "int4"],
    ["stable-diffusion-xl", "int8"],
    ["stable-diffusion-xl", "int4"],
  ])("%s @ %s -> LOW confidence with promoted tier", (modelId, quant) => {
    const model = getModel(modelId)!;
    const r = calculateEstimate({ model: modelId, quantization: quant });
    expect(r.confidence).toBe("LOW");
    expect(r.tier).toBe(promoteTier(model.tier));
  });
});

describe("Req 22.1: token memory contributes on the formula path", () => {
  it("adds token memory to the MEDIUM-path VRAM estimate", () => {
    const withoutTokens = calculateEstimate({
      model: "llama-3-405b",
      quantization: "fp16",
      input_tokens: 0,
      max_tokens: 0,
    });
    const withTokens = calculateEstimate({
      model: "llama-3-405b",
      quantization: "fp16",
      input_tokens: 5000,
      max_tokens: 5000,
    });
    expect(withTokens.min_vram_gb).toBeGreaterThan(withoutTokens.min_vram_gb);
  });
});

describe("Req 22.1: default quantization and error handling", () => {
  it("uses the model default quantization when none is supplied", () => {
    const model = getModel("llama-3-8b")!;
    const r = calculateEstimate({ model: "llama-3-8b" });
    expect(r.confidence).toBe("HIGH");
    expect(r.min_vram_gb).toBe(model.vram_gb[model.default_quantization]);
  });

  it("throws for an unknown model", () => {
    expect(() => calculateEstimate({ model: "no-such-model" })).toThrow(
      /Model not found/
    );
  });

  it("all four quantizations are recognized constants", () => {
    expect(QUANTIZATION_VALUES).toEqual(["fp32", "fp16", "int8", "int4"]);
  });
});
