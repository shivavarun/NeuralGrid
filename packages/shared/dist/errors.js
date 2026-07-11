"use strict";
/**
 * Shared error codes and error response structure for NeuralGrid.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERROR_HTTP_STATUS = exports.ErrorCode = void 0;
exports.createErrorResponse = createErrorResponse;
var ErrorCode;
(function (ErrorCode) {
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["MODEL_NOT_SUPPORTED"] = "MODEL_NOT_SUPPORTED";
    ErrorCode["BUDGET_EXCEEDED"] = "BUDGET_EXCEEDED";
    ErrorCode["INVALID_REQUEST"] = "INVALID_REQUEST";
    ErrorCode["JOB_NOT_FOUND"] = "JOB_NOT_FOUND";
    ErrorCode["JOB_NOT_COMPLETE"] = "JOB_NOT_COMPLETE";
    ErrorCode["INSUFFICIENT_CAPACITY"] = "INSUFFICIENT_CAPACITY";
    ErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    ErrorCode["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    // Production-readiness error codes
    ErrorCode["MISSING_IDEMPOTENCY_KEY"] = "MISSING_IDEMPOTENCY_KEY";
    ErrorCode["INVALID_IDEMPOTENCY_KEY"] = "INVALID_IDEMPOTENCY_KEY";
    ErrorCode["IDEMPOTENCY_CONFLICT"] = "IDEMPOTENCY_CONFLICT";
    ErrorCode["IDEMPOTENCY_IN_PROGRESS"] = "IDEMPOTENCY_IN_PROGRESS";
    ErrorCode["NO_NODE_AVAILABLE"] = "NO_NODE_AVAILABLE";
    ErrorCode["JOB_TIMEOUT"] = "JOB_TIMEOUT";
    ErrorCode["INVALID_OUTPUT"] = "INVALID_OUTPUT";
    ErrorCode["OOM_RETRY_EXHAUSTED"] = "OOM_RETRY_EXHAUSTED";
    ErrorCode["INPUT_CAP_EXCEEDED"] = "INPUT_CAP_EXCEEDED";
    ErrorCode["NO_CAPS_CONFIGURED"] = "NO_CAPS_CONFIGURED";
    ErrorCode["ADMIN_FORBIDDEN"] = "ADMIN_FORBIDDEN";
    ErrorCode["REAUTH_REQUIRED"] = "REAUTH_REQUIRED";
    ErrorCode["SIGNATURE_INVALID"] = "SIGNATURE_INVALID";
    ErrorCode["GO_LIVE_PENDING"] = "GO_LIVE_PENDING";
    ErrorCode["PRICE_STALE"] = "PRICE_STALE";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
/** HTTP status code mapping for each error code */
exports.ERROR_HTTP_STATUS = {
    [ErrorCode.UNAUTHORIZED]: 401,
    [ErrorCode.PAYMENT_FAILED]: 402,
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
    [ErrorCode.MODEL_NOT_SUPPORTED]: 400,
    [ErrorCode.BUDGET_EXCEEDED]: 400,
    [ErrorCode.INVALID_REQUEST]: 400,
    [ErrorCode.JOB_NOT_FOUND]: 404,
    [ErrorCode.JOB_NOT_COMPLETE]: 409,
    [ErrorCode.INSUFFICIENT_CAPACITY]: 503,
    [ErrorCode.INTERNAL_ERROR]: 500,
    // Production-readiness HTTP mappings
    [ErrorCode.MISSING_IDEMPOTENCY_KEY]: 400,
    [ErrorCode.INVALID_IDEMPOTENCY_KEY]: 400,
    [ErrorCode.IDEMPOTENCY_CONFLICT]: 409,
    [ErrorCode.IDEMPOTENCY_IN_PROGRESS]: 409,
    // job error_code only (surfaced on job resource, not a rejected request) — 200
    [ErrorCode.NO_NODE_AVAILABLE]: 200,
    [ErrorCode.JOB_TIMEOUT]: 200,
    [ErrorCode.INVALID_OUTPUT]: 200,
    [ErrorCode.OOM_RETRY_EXHAUSTED]: 200,
    [ErrorCode.INPUT_CAP_EXCEEDED]: 400,
    [ErrorCode.NO_CAPS_CONFIGURED]: 400,
    [ErrorCode.ADMIN_FORBIDDEN]: 403,
    [ErrorCode.REAUTH_REQUIRED]: 401,
    [ErrorCode.SIGNATURE_INVALID]: 400,
    [ErrorCode.GO_LIVE_PENDING]: 403,
    [ErrorCode.PRICE_STALE]: 503,
};
/** Helper to create a consistent error response */
function createErrorResponse(code, message, details) {
    return {
        error: {
            code,
            message,
            ...(details && { details }),
        },
    };
}
//# sourceMappingURL=errors.js.map