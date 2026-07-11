import { describe, it, expect, beforeEach } from "vitest";
import {
  getModel,
  getAllModels,
  modelExists,
  resetRegistry,
  loadRegistry,
} from "./registry";

describe("Model Registry Loader", () => {
  beforeEach(() => {
    resetRegistry();
  });

  it("loads registry from model_registry.yaml", () => {
    const reg = loadRegistry();
    expect(reg.models).toBeDefined();
    expect(Object.keys(reg.models).length).toBeGreaterThan(5);
  });

  it("getModel returns model entry for valid ID", () => {
    const model = getModel("llama-3-8b");
    expect(model).toBeDefined();
    expect(model!.family).toBe("llama");
    expect(model!.params_billions).toBe(8);
    expect(model!.tier).toBe("T1");
    expect(model!.vram_gb.int8).toBe(10);
  });

  it("getModel returns undefined for unknown model", () => {
    const model = getModel("nonexistent-model-xyz");
    expect(model).toBeUndefined();
  });

  it("getAllModels returns all models from registry", () => {
    const models = getAllModels();
    expect(models["llama-3-8b"]).toBeDefined();
    expect(models["stable-diffusion-xl"]).toBeDefined();
    expect(models["whisper-large-v3"]).toBeDefined();
  });

  it("modelExists returns true for known model", () => {
    expect(modelExists("mistral-7b")).toBe(true);
  });

  it("modelExists returns false for unknown model", () => {
    expect(modelExists("fake-model")).toBe(false);
  });

  it("caches registry in memory after first load", () => {
    const first = loadRegistry();
    const second = loadRegistry();
    // Same reference means cached
    expect(first).toBe(second);
  });

  it("covers multiple tiers", () => {
    const t1 = getModel("llama-3-8b");
    const t2 = getModel("llama-3-13b");
    const t3 = getModel("llama-3-70b");
    expect(t1!.tier).toBe("T1");
    expect(t2!.tier).toBe("T2");
    expect(t3!.tier).toBe("T3");
  });

  it("covers image models", () => {
    const sd = getModel("stable-diffusion-xl");
    expect(sd!.family).toBe("diffusion");
    expect(sd!.input_types).toContain("image");
    expect(sd!.output_types).toContain("image");
  });
});
