/**
 * Shared error codes and error response structure for NeuralGrid.
 */

export enum ErrorCode {
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

  // Production-readiness error codes
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
  PRICE_STALE = "PRICE_STALE",
}

/** HTTP status code mapping for each error code */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
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

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

/** Helper to create a consistent error response */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}
