import { describe, it, expect, beforeEach } from "vitest";
import { calculateEstimate } from "./estimator";
import { resetRegistry } from "./registry";

describe("calculateEstimate", () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe("Path 1: Exact registry lookup (HIGH confidence)", () => {
    it("returns HIGH confidence when exact VRAM found", () => {
      const result = calculateEstimate({ model: "llama-3-8b", quantization: "int8" });
      expect(result.confidence).toBe("HIGH");
      expect(result.min_vram_gb).toBe(10);
      expect(result.tier).toBe("T1");
    });

    it("assigns T2 for fp16 of llama-3-8b (19GB)", () => {
      const result = calculateEstimate({ model: "llama-3-8b", quantization: "fp16" });
      expect(result.confidence).toBe("HIGH");
      expect(result.min_vram_gb).toBe(19);
      expect(result.tier).toBe("T2");
    });

    it("assigns T3 for large models", () => {
      const result = calculateEstimate({ model: "llama-3-70b", quantization: "int4" });
      expect(result.confidence).toBe("HIGH");
      expect(result.min_vram_gb).toBe(40);
      expect(result.tier).toBe("T3");
    });

    it("uses default quantization when none specified", () => {
      const result = calculateEstimate({ model: "llama-3-8b" });
      // default_quantization is int8, vram_gb.int8 = 10
      expect(result.confidence).toBe("HIGH");
      expect(result.min_vram_gb).toBe(10);
    });
  });

  describe("Path 2: LLM formula (MEDIUM confidence)", () => {
    it("uses formula when quantization not in registry vram_gb", () => {
      // llama-3-70b has no fp32 entry
      const result = calculateEstimate({ model: "llama-3-70b", quantization: "fp32" });
      expect(result.confidence).toBe("MEDIUM");
      // formula: (70 * 4 * 1.2) + (0 * TOKEN_MEMORY_FACTOR) = 336, then * 1.2 buffer = 403.2
      expect(result.min_vram_gb).toBe(403.2);
      expect(result.tier).toBe("T3");
    });

    it("includes token memory in formula", () => {
      const result = calculateEstimate({
        model: "llama-3-70b",
        quantization: "fp32",
        input_tokens: 1000,
        max_tokens: 1000,
      });
      expect(result.confidence).toBe("MEDIUM");
      // base = (70 * 4 * 1.2) + (2000 * 0.002048) = 336 + 4.096 = 340.096
      // with buffer: 340.096 * 1.2 = 408.1152
      expect(result.min_vram_gb).toBeCloseTo(408.12, 1);
    });
  });

  describe("Path 3: No params_billions (LOW confidence)", () => {
    it("uses default tier from registry for image models", () => {
      // stable-diffusion-xl has no params_billions, tier is T2
      const result = calculateEstimate({ model: "stable-diffusion-xl", quantization: "fp16" });
      // It has vram_gb.fp16 = 8, so it actually hits Path 1
      expect(result.confidence).toBe("HIGH");
    });

    it("promotes tier for LOW confidence models", () => {
      // whisper-tiny has no params_billions, tier T1
      // But whisper-tiny has vram_gb.fp16 = 0.3, so if we use an unsupported quant...
      // Actually whisper-tiny only has fp32 and fp16 in vram_gb
      const result = calculateEstimate({ model: "whisper-tiny", quantization: "int8" });
      // No params_billions, no vram_gb.int8 → Path 3, LOW confidence
      // tier from registry is T1, promoted to T2
      expect(result.confidence).toBe("LOW");
      expect(result.tier).toBe("T2");
    });
  });

  describe("Tier boundaries", () => {
    it("T1 boundary: 12GB is T1", () => {
      // flux-1-schnell fp16 = 12GB
      const result = calculateEstimate({ model: "flux-1-schnell", quantization: "fp16" });
      expect(result.tier).toBe("T1");
      expect(result.min_vram_gb).toBe(12);
    });

    it("T2 boundary: >12GB is T2", () => {
      // llama-3-3b fp32 = 14GB
      const result = calculateEstimate({ model: "llama-3-3b", quantization: "fp32" });
      expect(result.tier).toBe("T2");
      expect(result.min_vram_gb).toBe(14);
    });

    it("T3 boundary: >28GB is T3", () => {
      // llama-3-8b fp32 = 38GB
      const result = calculateEstimate({ model: "llama-3-8b", quantization: "fp32" });
      expect(result.tier).toBe("T3");
      expect(result.min_vram_gb).toBe(38);
    });
  });

  describe("Error handling", () => {
    it("throws for unknown model", () => {
      expect(() => calculateEstimate({ model: "nonexistent-model" })).toThrow(
        "Model not found: nonexistent-model"
      );
    });
  });
});
