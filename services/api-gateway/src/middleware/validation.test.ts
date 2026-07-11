import { describe, it, expect, vi } from "vitest";
import { createValidationMiddleware, ModelEntry, ModelLookup } from "./validation";
import { ErrorCode } from "@neuralgrid/shared";

// Mock model for testing
const mockLlama: ModelEntry = {
  family: "llama",
  params_billions: 8,
  default_quantization: "int8",
  vram_gb: { fp32: 38, fp16: 19, int8: 10, int4: 5 },
  tier: "T1",
  input_types: ["text"],
  output_types: ["text"],
};

const mockSDXL: ModelEntry = {
  family: "diffusion",
  default_quantization: "fp16",
  vram_gb: { fp32: 14, fp16: 8 },
  tier: "T2",
  input_types: ["text", "image"],
  output_types: ["image"],
};

const mockGetModel: ModelLookup = (id: string) => {
  if (id === "llama-3-8b") return mockLlama;
  if (id === "stable-diffusion-xl") return mockSDXL;
  return undefined;
};

function makeMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeMockReq(body: any) {
  return { body } as any;
}

describe("validation middleware", () => {
  const validate = createValidationMiddleware(mockGetModel);

  describe("required fields", () => {
    it("returns 400 when model is missing", () => {
      const req = makeMockReq({ input: { type: "text", content: "hi" }, output: { type: "text" } });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.INVALID_REQUEST,
            details: { missing_fields: ["model"] },
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 400 with all missing fields listed", () => {
      const req = makeMockReq({});
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.details.missing_fields).toEqual(["model", "input", "output"]);
    });

    it("returns 400 when input and output are missing", () => {
      const req = makeMockReq({ model: "llama-3-8b" });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.details.missing_fields).toEqual(["input", "output"]);
    });
  });

  describe("model validation", () => {
    it("returns 400 MODEL_NOT_SUPPORTED for unknown model", () => {
      const req = makeMockReq({
        model: "nonexistent-model",
        input: { type: "text", content: "hi" },
        output: { type: "text" },
      });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ErrorCode.MODEL_NOT_SUPPORTED,
          }),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("quantization validation", () => {
    it("returns 400 for unsupported quantization", () => {
      const req = makeMockReq({
        model: "stable-diffusion-xl",
        quantization: "int4",
        input: { type: "text", content: "a dog" },
        output: { type: "image" },
      });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(body.error.details.supported_quantizations).toEqual(["fp32", "fp16"]);
    });

    it("passes for valid quantization", () => {
      const req = makeMockReq({
        model: "llama-3-8b",
        quantization: "fp16",
        input: { type: "text", content: "hi" },
        output: { type: "text" },
      });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("skips quantization check when not provided", () => {
      const req = makeMockReq({
        model: "llama-3-8b",
        input: { type: "text", content: "hi" },
        output: { type: "text" },
      });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("input type validation", () => {
    it("returns 400 for unsupported input type", () => {
      const req = makeMockReq({
        model: "llama-3-8b",
        input: { type: "image", content: "data" },
        output: { type: "text" },
      });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = res.json.mock.calls[0][0];
      expect(body.error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(body.error.details.supported_input_types).toEqual(["text"]);
    });

    it("passes for valid input type", () => {
      const req = makeMockReq({
        model: "stable-diffusion-xl",
        input: { type: "image", content: "data" },
        output: { type: "image" },
      });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("valid requests", () => {
    it("calls next() for fully valid request", () => {
      const req = makeMockReq({
        model: "llama-3-8b",
        quantization: "int8",
        input: { type: "text", content: "Hello world" },
        output: { type: "text", max_tokens: 100 },
      });
      const res = makeMockRes();
      const next = vi.fn();

      validate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
