"use strict";
/**
 * Input validation middleware for job submission (POST /v1/jobs).
 * Validates required fields, model existence, quantization, and input type.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createValidationMiddleware = createValidationMiddleware;
const shared_1 = require("@neuralgrid/shared");
/**
 * Factory: creates validation middleware with injectable model lookup.
 * This allows unit testing without loading YAML from disk.
 */
function createValidationMiddleware(getModel) {
    return function validateJobSubmission(req, res, next) {
        const body = req.body;
        // 1. Check required fields
        const requiredFields = ["model", "input", "output"];
        const missingFields = requiredFields.filter((f) => body[f] === undefined || body[f] === null);
        if (missingFields.length > 0) {
            const errResp = (0, shared_1.createErrorResponse)(shared_1.ErrorCode.INVALID_REQUEST, `Missing required fields: ${missingFields.join(", ")}`, { missing_fields: missingFields });
            res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.INVALID_REQUEST]).json(errResp);
            return;
        }
        // 2. Validate model exists in registry
        const model = getModel(body.model);
        if (!model) {
            const errResp = (0, shared_1.createErrorResponse)(shared_1.ErrorCode.MODEL_NOT_SUPPORTED, `Model '${body.model}' is not supported`, { model: body.model });
            res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.MODEL_NOT_SUPPORTED]).json(errResp);
            return;
        }
        // 3. Validate quantization (if provided)
        if (body.quantization !== undefined) {
            const supportedQuantizations = Object.keys(model.vram_gb);
            if (!supportedQuantizations.includes(body.quantization)) {
                const errResp = (0, shared_1.createErrorResponse)(shared_1.ErrorCode.INVALID_REQUEST, `Quantization '${body.quantization}' is not supported for model '${body.model}'`, { supported_quantizations: supportedQuantizations });
                res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.INVALID_REQUEST]).json(errResp);
                return;
            }
        }
        // 4. Validate input type
        if (body.input && body.input.type) {
            if (!model.input_types.includes(body.input.type)) {
                const errResp = (0, shared_1.createErrorResponse)(shared_1.ErrorCode.INVALID_REQUEST, `Input type '${body.input.type}' is not supported for model '${body.model}'`, { supported_input_types: model.input_types });
                res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.INVALID_REQUEST]).json(errResp);
                return;
            }
        }
        next();
    };
}
//# sourceMappingURL=validation.js.map