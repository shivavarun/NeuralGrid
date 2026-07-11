"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const validation_1 = require("./validation");
const shared_1 = require("@neuralgrid/shared");
// Mock model for testing
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
const mockGetModel = (id) => {
    if (id === "llama-3-8b")
        return mockLlama;
    if (id === "stable-diffusion-xl")
        return mockSDXL;
    return undefined;
};
function makeMockRes() {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
}
function makeMockReq(body) {
    return { body };
}
(0, vitest_1.describe)("validation middleware", () => {
    const validate = (0, validation_1.createValidationMiddleware)(mockGetModel);
    (0, vitest_1.describe)("required fields", () => {
        (0, vitest_1.it)("returns 400 when model is missing", () => {
            const req = makeMockReq({ input: { type: "text", content: "hi" }, output: { type: "text" } });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                error: vitest_1.expect.objectContaining({
                    code: shared_1.ErrorCode.INVALID_REQUEST,
                    details: { missing_fields: ["model"] },
                }),
            }));
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        });
        (0, vitest_1.it)("returns 400 with all missing fields listed", () => {
            const req = makeMockReq({});
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.details.missing_fields).toEqual(["model", "input", "output"]);
        });
        (0, vitest_1.it)("returns 400 when input and output are missing", () => {
            const req = makeMockReq({ model: "llama-3-8b" });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.details.missing_fields).toEqual(["input", "output"]);
        });
    });
    (0, vitest_1.describe)("model validation", () => {
        (0, vitest_1.it)("returns 400 MODEL_NOT_SUPPORTED for unknown model", () => {
            const req = makeMockReq({
                model: "nonexistent-model",
                input: { type: "text", content: "hi" },
                output: { type: "text" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                error: vitest_1.expect.objectContaining({
                    code: shared_1.ErrorCode.MODEL_NOT_SUPPORTED,
                }),
            }));
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("quantization validation", () => {
        (0, vitest_1.it)("returns 400 for unsupported quantization", () => {
            const req = makeMockReq({
                model: "stable-diffusion-xl",
                quantization: "int4",
                input: { type: "text", content: "a dog" },
                output: { type: "image" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.code).toBe(shared_1.ErrorCode.INVALID_REQUEST);
            (0, vitest_1.expect)(body.error.details.supported_quantizations).toEqual(["fp32", "fp16"]);
        });
        (0, vitest_1.it)("passes for valid quantization", () => {
            const req = makeMockReq({
                model: "llama-3-8b",
                quantization: "fp16",
                input: { type: "text", content: "hi" },
                output: { type: "text" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(next).toHaveBeenCalled();
        });
        (0, vitest_1.it)("skips quantization check when not provided", () => {
            const req = makeMockReq({
                model: "llama-3-8b",
                input: { type: "text", content: "hi" },
                output: { type: "text" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(next).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("input type validation", () => {
        (0, vitest_1.it)("returns 400 for unsupported input type", () => {
            const req = makeMockReq({
                model: "llama-3-8b",
                input: { type: "image", content: "data" },
                output: { type: "text" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(400);
            const body = res.json.mock.calls[0][0];
            (0, vitest_1.expect)(body.error.code).toBe(shared_1.ErrorCode.INVALID_REQUEST);
            (0, vitest_1.expect)(body.error.details.supported_input_types).toEqual(["text"]);
        });
        (0, vitest_1.it)("passes for valid input type", () => {
            const req = makeMockReq({
                model: "stable-diffusion-xl",
                input: { type: "image", content: "data" },
                output: { type: "image" },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(next).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)("valid requests", () => {
        (0, vitest_1.it)("calls next() for fully valid request", () => {
            const req = makeMockReq({
                model: "llama-3-8b",
                quantization: "int8",
                input: { type: "text", content: "Hello world" },
                output: { type: "text", max_tokens: 100 },
            });
            const res = makeMockRes();
            const next = vitest_1.vi.fn();
            validate(req, res, next);
            (0, vitest_1.expect)(next).toHaveBeenCalled();
            (0, vitest_1.expect)(res.status).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=validation.test.js.map