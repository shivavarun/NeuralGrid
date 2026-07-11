/**
 * Property-based tests for validation middleware.
 * Feature: neuralgrid-mvp
 *
 * Properties tested:
 *   Property 6: Invalid Model Rejection
 *   Property 15: Unsupported Quantization/Input Type
 *   Property 16: Missing Field Validation
 *
 * Validates: Requirements 1.2, 4.3, 12.1, 12.2, 12.3
 */

import { describe, it, expect, vi } from "vitest";
import fc from "fast-check";
import {
  createValidationMiddleware,
  ModelEntry,
  ModelLookup,
} from "./validation";
import { ErrorCode } from "@neuralgrid/shared";

// --- Test fixtures ---

const KNOWN_MODELS = ["llama-3-8b", "stable-diffusion-xl"];

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

const modelRegistry: Record<string, ModelEntry> = Object.create(null);
modelRegistry["llama-3-8b"] = mockLlama;
modelRegistry["stable-diffusion-xl"] = mockSDXL;

const mockGetModel: ModelLookup = (id: string) => modelRegistry[id];

// --- Helpers ---

function makeMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeMockReq(body: any) {
  return { body } as any;
}

// --- Property Tests ---

describe("Property 6: Invalid Model Rejection", () => {
  /**
   * For any model identifier NOT in registry, the middleware SHALL
   * return 400 with code MODEL_NOT_SUPPORTED.
   *
   * **Validates: Requirements 1.2, 4.3**
   */
  const validate = createValidationMiddleware(mockGetModel);

  it("rejects any model not in registry with 400 MODEL_NOT_SUPPORTED", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => !KNOWN_MODELS.includes(s)),
        (unknownModel) => {
          const req = makeMockReq({
            model: unknownModel,
            input: { type: "text", content: "test" },
            output: { type: "text" },
          });
          const res = makeMockRes();
          const next = vi.fn();

          validate(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
          const body = res.json.mock.calls[0][0];
          expect(body.error.code).toBe(ErrorCode.MODEL_NOT_SUPPORTED);
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Property 15: Unsupported Quantization/Input Type", () => {
  /**
   * For any (model, quantization) pair where quantization is NOT in model's
   * supported list, verify 400 with supported_quantizations listed.
   * For any (model, input_type) pair where input_type is NOT in model's
   * supported list, verify 400 with supported_input_types listed.
   *
   * **Validates: Requirements 12.1, 12.3**
   */
  const validate = createValidationMiddleware(mockGetModel);

  it("rejects unsupported quantization with 400 and lists supported options", () => {
    // Use llama-3-8b which supports fp32, fp16, int8, int4
    const supportedQuants = Object.keys(mockLlama.vram_gb);

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1 })
          .filter((s) => !supportedQuants.includes(s)),
        (badQuant) => {
          const req = makeMockReq({
            model: "llama-3-8b",
            quantization: badQuant,
            input: { type: "text", content: "test" },
            output: { type: "text" },
          });
          const res = makeMockRes();
          const next = vi.fn();

          validate(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
          const body = res.json.mock.calls[0][0];
          expect(body.error.code).toBe(ErrorCode.INVALID_REQUEST);
          expect(body.error.details.supported_quantizations).toEqual(
            supportedQuants
          );
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects unsupported quantization for SDXL (only fp32, fp16)", () => {
    const supportedQuants = Object.keys(mockSDXL.vram_gb);

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1 })
          .filter((s) => !supportedQuants.includes(s)),
        (badQuant) => {
          const req = makeMockReq({
            model: "stable-diffusion-xl",
            quantization: badQuant,
            input: { type: "text", content: "prompt" },
            output: { type: "image" },
          });
          const res = makeMockRes();
          const next = vi.fn();

          validate(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
          const body = res.json.mock.calls[0][0];
          expect(body.error.code).toBe(ErrorCode.INVALID_REQUEST);
          expect(body.error.details.supported_quantizations).toEqual(
            supportedQuants
          );
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it("rejects unsupported input type with 400 and lists supported options", () => {
    // llama-3-8b only supports "text" input
    const supportedInputTypes = mockLlama.input_types;

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1 })
          .filter((s) => !supportedInputTypes.includes(s)),
        (badInputType) => {
          const req = makeMockReq({
            model: "llama-3-8b",
            input: { type: badInputType, content: "test" },
            output: { type: "text" },
          });
          const res = makeMockRes();
          const next = vi.fn();

          validate(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
          const body = res.json.mock.calls[0][0];
          expect(body.error.code).toBe(ErrorCode.INVALID_REQUEST);
          expect(body.error.details.supported_input_types).toEqual(
            supportedInputTypes
          );
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Property 16: Missing Field Validation", () => {
  /**
   * For any non-empty subset of {model, input, output} that is omitted,
   * verify 400 INVALID_REQUEST with missing_fields matching exactly
   * the omitted fields.
   *
   * **Validates: Requirements 12.2**
   */
  const validate = createValidationMiddleware(mockGetModel);

  it("returns 400 identifying exactly which required fields are missing", () => {
    const allFields = ["model", "input", "output"] as const;

    // Generate non-empty subsets of fields to omit
    const nonEmptySubsetArb = fc
      .subarray([...allFields], { minLength: 1, maxLength: 3 })
      .filter((arr) => arr.length > 0);

    fc.assert(
      fc.property(nonEmptySubsetArb, (fieldsToOmit) => {
        // Build body with all fields present, then delete omitted ones
        const body: Record<string, any> = {
          model: "llama-3-8b",
          input: { type: "text", content: "hello" },
          output: { type: "text" },
        };

        for (const field of fieldsToOmit) {
          delete body[field];
        }

        const req = makeMockReq(body);
        const res = makeMockRes();
        const next = vi.fn();

        validate(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        const responseBody = res.json.mock.calls[0][0];
        expect(responseBody.error.code).toBe(ErrorCode.INVALID_REQUEST);

        // missing_fields should match exactly the omitted fields (same set)
        const reportedMissing = responseBody.error.details.missing_fields;
        expect(reportedMissing.sort()).toEqual([...fieldsToOmit].sort());
        expect(next).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });
});
