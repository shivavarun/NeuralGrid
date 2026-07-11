/**
 * Shared error codes and error response structure for NeuralGrid.
 */
export declare enum ErrorCode {
    UNAUTHORIZED = "UNAUTHORIZED",
    MODEL_NOT_SUPPORTED = "MODEL_NOT_SUPPORTED",
    BUDGET_EXCEEDED = "BUDGET_EXCEEDED",
    INVALID_REQUEST = "INVALID_REQUEST",
    JOB_NOT_FOUND = "JOB_NOT_FOUND",
    JOB_NOT_COMPLETE = "JOB_NOT_COMPLETE",
    INSUFFICIENT_CAPACITY = "INSUFFICIENT_CAPACITY",
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    PAYMENT_FAILED = "PAYMENT_FAILED",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    MISSING_IDEMPOTENCY_KEY = "MISSING_IDEMPOTENCY_KEY",
    INVALID_IDEMPOTENCY_KEY = "INVALID_IDEMPOTENCY_KEY",
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT",
    IDEMPOTENCY_IN_PROGRESS = "IDEMPOTENCY_IN_PROGRESS",
    NO_NODE_AVAILABLE = "NO_NODE_AVAILABLE",
    JOB_TIMEOUT = "JOB_TIMEOUT",
    INVALID_OUTPUT = "INVALID_OUTPUT",
    OOM_RETRY_EXHAUSTED = "OOM_RETRY_EXHAUSTED",
    INPUT_CAP_EXCEEDED = "INPUT_CAP_EXCEEDED",
    NO_CAPS_CONFIGURED = "NO_CAPS_CONFIGURED",
    ADMIN_FORBIDDEN = "ADMIN_FORBIDDEN",
    REAUTH_REQUIRED = "REAUTH_REQUIRED",
    SIGNATURE_INVALID = "SIGNATURE_INVALID",
    GO_LIVE_PENDING = "GO_LIVE_PENDING",
    PRICE_STALE = "PRICE_STALE"
}
/** HTTP status code mapping for each error code */
export declare const ERROR_HTTP_STATUS: Record<ErrorCode, number>;
export interface ErrorResponse {
    error: {
        code: ErrorCode;
        message: string;
        details?: Record<string, unknown>;
    };
}
/** Helper to create a consistent error response */
export declare function createErrorResponse(code: ErrorCode, message: string, details?: Record<string, unknown>): ErrorResponse;
//# sourceMappingURL=errors.d.ts.map