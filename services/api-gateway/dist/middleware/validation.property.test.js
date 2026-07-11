"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const validation_1 = require("./validation");
const shared_1 = require("@neuralgrid/shared");
// --- Test fixtures ---
const KNOWN_MODELS = ["llama-3-8b", "stable-diffusion-xl"];
const mockLlama = {
    family: "llama",
    params_billions: 8,
    default_quantization: "int8",
    vram_gb: { fp32: 38, fp16: 19, int8: 10, int4: 5 },
    tier: "T1",
    input_types: ["text"],
    output_types: ["text"],
};
const mockSDXL = {
    family: "diffusion",
    default_quantization: "fp16",
    vram_gb: { fp32: 14, fp16: 8 },
    tier: "T2",
    input_types: ["text", "image"],
    output_types: ["image"],
};
const modelRegistry = Object.create(null);
modelRegistry["llama-3-8b"] = mockLlama;
modelRegistry["stable-diffusion-xl"] = mockSDXL;
const mockGetModel = (id) => modelRegistry[id];
// --- Helpers ---
function makeMockRes() {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
}
function makeMockReq(body) {
    return { body };
}
// --- Property Tests ---
(0, vitest_1.describe)("Property 6: Invalid Model Rejection", () => {
    /**
     * For any model identifier NOT in registry, the middleware SHALL
     * return 400 with code MODEL_NOT_SUPPORTED.
     *
     * **Validates: Requirements 1.2, 4.3**
     */
    const validate = (0, validation_1.createValidationMiddleware)(mockGetModel);
    (0, vitest_1.it)("rejects any model not in registry with 400 MODEL_NOT_SUPPORTED", () => {
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default.string({ minLength: 1 }).filter((s) => !KNOWN_MODELS.includes(s)), (unknownModel) => {
            const req = makeMockReq({
                model: unknownModel,
                input: { type: "text", content: "test" },
                output: { type: "text" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.code).toBe(shared_1.ErrorCode.MODEL_NOT_SUPPORTED);
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
});
(0, vitest_1.describe)("Property 15: Unsupported Quantization/Input Type", () => {
    /**
     * For any (model, quantization) pair where quantization is NOT in model's
     * supported list, verify 400 with supported_quantizations listed.
     * For any (model, input_type) pair where input_type is NOT in model's
     * supported list, verify 400 with supported_input_types listed.
     *
     * **Validates: Requirements 12.1, 12.3**
     */
    const validate = (0, validation_1.createValidationMiddleware)(mockGetModel);
    (0, vitest_1.it)("rejects unsupported quantization with 400 and lists supported options", () => {
        // Use llama-3-8b which supports fp32, fp16, int8, int4
        const supportedQuants = Object.keys(mockLlama.vram_gb);
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default
            .string({ minLength: 1 })
            .filter((s) => !supportedQuants.includes(s)), (badQuant) => {
            const req = makeMockReq({
                model: "llama-3-8b",
                quantization: badQuant,
                input: { type: "text", content: "test" },
                output: { type: "text" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.code).toBe(shared_1.ErrorCode.INVALID_REQUEST);
            (0, vitest_1.expect)(body.error.details.supported_quantizations).toEqual(supportedQuants);
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("rejects unsupported quantization for SDXL (only fp32, fp16)", () => {
        const supportedQuants = Object.keys(mockSDXL.vram_gb);
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default
            .string({ minLength: 1 })
            .filter((s) => !supportedQuants.includes(s)), (badQuant) => {
            const req = makeMockReq({
                model: "stable-diffusion-xl",
                quantization: badQuant,
                input: { type: "text", content: "prompt" },
                output: { type: "image" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.code).toBe(shared_1.ErrorCode.INVALID_REQUEST);
            (0, vitest_1.expect)(body.error.details.supported_quantizations).toEqual(supportedQuants);
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
    (0, vitest_1.it)("rejects unsupported input type with 400 and lists supported options", () => {
        // llama-3-8b only supports "text" input
        const supportedInputTypes = mockLlama.input_types;
        fast_check_1.default.assert(fast_check_1.default.property(fast_check_1.default
            .string({ minLength: 1 })
            .filter((s) => !supportedInputTypes.includes(s)), (badInputType) => {
            const req = makeMockReq({
                model: "llama-3-8b",
                input: { type: badInputType, content: "test" },
                output: { type: "text" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.code).toBe(shared_1.ErrorCode.INVALID_REQUEST);
            (0, vitest_1.expect)(body.error.details.supported_input_types).toEqual(supportedInputTypes);
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
});
(0, vitest_1.describe)("Property 16: Missing Field Validation", () => {
    /**
     * For any non-empty subset of {model, input, output} that is omitted,
     * verify 400 INVALID_REQUEST with missing_fields matching exactly
     * the omitted fields.
     *
     * **Validates: Requirements 12.2**
     */
    const validate = (0, validation_1.createValidationMiddleware)(mockGetModel);
    (0, vitest_1.it)("returns 400 identifying exactly which required fields are missing", () => {
        const allFields = ["model", "input", "output"];
        // Generate non-empty subsets of fields to omit
        const nonEmptySubsetArb = fast_check_1.default
            .subarray([...allFields], { minLength: 1, maxLength: 3 })
            .filter((arr) => arr.length > 0);
        fast_check_1.default.assert(fast_check_1.default.property(nonEmptySubsetArb, (fieldsToOmit) => {
            // Build body with all fields present, then delete omitted ones
            const body = {
                model: "llama-3-8b",
                input: { type: "text", content: "hello" },
                output: { type: "text" },
            };
            for (const field of fieldsToOmit) {
                delete body[field];
            }
            const req = makeMockReq(body);
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const responseBody = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(responseBody.error.code).toBe(shared_1.ErrorCode.INVALID_REQUEST);
            // missing_fields should match exactly the omitted fields (same set)
            const reportedMissing = responseBody.error.details.missing_fields;
            (0, vitest_1.expect)(reportedMissing.sort()).toEqual([...fieldsToOmit].sort());
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=validation.property.test.js.map