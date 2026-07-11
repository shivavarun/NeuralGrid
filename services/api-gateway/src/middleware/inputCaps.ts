/**
 * Input size and cost cap validation for job submission (POST /v1/jobs), plus
 * cap-configuration cost checking (Requirement 16).
 *
 * Responsibilities:
 *  - Reject a submission whose prompt length, image size, or requested output
 *    tokens exceeds the configured maximum for its `job_type`, with a 400 that
 *    names EVERY offending field together with the submitted value and the
 *    configured maximum (Req 16.1).
 *  - Return a 400 `NO_CAPS_CONFIGURED` when the submission's `job_type` has no
 *    configured caps (Req 16.2).
 *  - Reject a proposed/updated cap configuration whose `estimated_cost_usd`,
 *    computed from its capped maximum values, exceeds `max_job_cost_cap`
 *    ($5.00) (Req 16.3).
 *
 * Design: the decision logic is pure and framework-free (`findCapViolations`,
 * `checkCapConfigCost`, `measureSubmission`, `resolveJobType`) so it is unit /
 * property testable in isolation. The Express wrapper (`createInputCapsMiddleware`)
 * only adapts a request into measurements and translates the result into a
 * response, short-circuiting before any downstream handler runs so a rejected
 * submission never creates a job or a charge.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

import type { Request, Response, NextFunction } from 'express';
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  createErrorResponse,
} from '@neuralgrid/shared';

// --- Constants ---

/**
 * The maximum permitted `estimated_cost_usd` for a single Job (Req 16.3).
 * A cap configuration is rejected if the cost implied by its capped maximums
 * exceeds this value.
 */
export const MAX_JOB_COST_CAP_USD = 5.0;

// --- Config + violation shapes ---

/** Per-`job_type` input caps (design: API_Gateway "Input caps"). */
export interface InputCaps {
  job_type: string;
  max_prompt_chars: number;
  max_image_bytes: number;
  max_output_tokens: number;
}

/** A single field that exceeded its configured cap (Req 16.1). */
export interface CapViolation {
  field: string;
  submitted: number;
  maximum: number;
}

/** The three cap-governed measurements taken from a submission (Req 16.1). */
export interface JobSubmissionMeasures {
  prompt_chars: number;
  image_bytes: number;
  output_tokens: number;
}

// --- Pure validation (no I/O; unit/property testable) ---

/**
 * Return a CapViolation for every measurement that exceeds its configured
 * maximum, in a stable field order. An empty array means the submission is
 * within all caps (Req 16.1).
 */
export function findCapViolations(
  caps: InputCaps,
  measures: JobSubmissionMeasures
): CapViolation[] {
  const violations: CapViolation[] = [];
  const checks: Array<{ field: keyof JobSubmissionMeasures; maximum: number }> = [
    { field: 'prompt_chars', maximum: caps.max_prompt_chars },
    { field: 'image_bytes', maximum: caps.max_image_bytes },
    { field: 'output_tokens', maximum: caps.max_output_tokens },
  ];
  for (const { field, maximum } of checks) {
    const submitted = measures[field];
    if (submitted > maximum) {
      violations.push({ field, submitted, maximum });
    }
  }
  return violations;
}

/**
 * Estimates an `estimated_cost_usd` for a job that saturates every one of a
 * cap configuration's maximums. Injected into `checkCapConfigCost` so the
 * cost model (token pricing, image pricing, ...) lives with the caller rather
 * than being hard-coded here.
 */
export type CapConfigCostEstimator = (caps: InputCaps) => number;

/** Outcome of the cap-configuration cost check (Req 16.3). */
export type CapConfigCheck =
  | { ok: true; estimated_cost_usd: number }
  | { ok: false; estimated_cost_usd: number; max_job_cost_cap: number };

/**
 * Reject a cap configuration whose worst-case estimated cost — computed from
 * its capped maximums via `estimate` — exceeds `max_job_cost_cap` (Req 16.3).
 * The boundary is inclusive: a configuration whose cost equals the cap exactly
 * is accepted; only a strictly greater cost is rejected.
 */
export function checkCapConfigCost(
  caps: InputCaps,
  estimate: CapConfigCostEstimator,
  maxJobCostCap: number = MAX_JOB_COST_CAP_USD
): CapConfigCheck {
  const estimated_cost_usd = estimate(caps);
  if (estimated_cost_usd > maxJobCostCap) {
    return { ok: false, estimated_cost_usd, max_job_cost_cap: maxJobCostCap };
  }
  return { ok: true, estimated_cost_usd };
}

// --- Submission measurement (default extraction from request body) ---

/** Byte length of string/Buffer content; 0 for anything else. */
function byteLength(content: unknown): number {
  if (typeof content === 'string') return Buffer.byteLength(content, 'utf8');
  if (Buffer.isBuffer(content)) return content.length;
  return 0;
}

/**
 * Extract the three cap-governed measurements from a submission body. Kept
 * lenient: a missing field measures as 0 so it can never spuriously exceed a
 * cap. Injectable via the middleware deps for deployments whose body shape
 * differs.
 */
export function measureSubmission(body: any): JobSubmissionMeasures {
  const input = body?.input ?? {};
  const output = body?.output ?? {};
  const isImageInput = input?.type === 'image';

  // Prompt length in characters. Image inputs are measured as bytes below, so a
  // binary/base64 image payload is not double-counted as a prompt.
  const promptSource =
    typeof body?.prompt === 'string'
      ? body.prompt
      : !isImageInput && typeof input?.content === 'string'
        ? input.content
        : '';
  const prompt_chars = promptSource.length;

  // Image size in bytes: an explicit numeric field wins; otherwise fall back to
  // the byte length of an image input's content.
  let image_bytes = 0;
  if (typeof input?.image_bytes === 'number') {
    image_bytes = input.image_bytes;
  } else if (typeof body?.image_bytes === 'number') {
    image_bytes = body.image_bytes;
  } else if (isImageInput) {
    image_bytes = byteLength(input?.content);
  }

  // Requested output tokens.
  const output_tokens =
    typeof output?.max_tokens === 'number'
      ? output.max_tokens
      : typeof body?.max_tokens === 'number'
        ? body.max_tokens
        : 0;

  return { prompt_chars, image_bytes, output_tokens };
}

/**
 * Resolve a submission's `job_type`. Prefers an explicit `job_type`, then the
 * output/input `type` discriminators used elsewhere in the gateway. Returns
 * undefined when none is present (treated as no-caps-configured, Req 16.2).
 */
export function resolveJobType(body: any): string | undefined {
  if (typeof body?.job_type === 'string' && body.job_type.length > 0) {
    return body.job_type;
  }
  if (typeof body?.output?.type === 'string' && body.output.type.length > 0) {
    return body.output.type;
  }
  if (typeof body?.input?.type === 'string' && body.input.type.length > 0) {
    return body.input.type;
  }
  return undefined;
}

// --- Express adaptation ---

/** Looks up the configured caps for a `job_type`, or undefined if none. */
export type CapsLookup = (jobType: string) => InputCaps | undefined;

export interface InputCapsMiddlewareDeps {
  /** Resolve configured caps for a `job_type` (undefined => none configured). */
  getCaps: CapsLookup;
  /** Override how measurements are extracted from the request body. */
  measure?: (body: any) => JobSubmissionMeasures;
  /** Override how the `job_type` is resolved from the request body. */
  resolveJobType?: (body: any) => string | undefined;
}

/**
 * Express middleware enforcing per-`job_type` input caps on POST /v1/jobs.
 *
 * Order of checks:
 *  1. No resolvable `job_type`, or a `job_type` with no configured caps
 *     -> 400 NO_CAPS_CONFIGURED (Req 16.2).
 *  2. One or more measurements exceed their cap
 *     -> 400 INPUT_CAP_EXCEEDED listing every offending field with its
 *        submitted value and configured maximum (Req 16.1).
 *  3. Otherwise, pass control to the next handler.
 *
 * The middleware short-circuits on rejection before any job is created or
 * charged.
 */
export function createInputCapsMiddleware(deps: InputCapsMiddlewareDeps) {
  const measure = deps.measure ?? measureSubmission;
  const resolve = deps.resolveJobType ?? resolveJobType;

  return function validateInputCaps(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const jobType = resolve(req.body);
    const caps = jobType !== undefined ? deps.getCaps(jobType) : undefined;

    if (!caps) {
      res
        .status(ERROR_HTTP_STATUS[ErrorCode.NO_CAPS_CONFIGURED])
        .json(
          createErrorResponse(
            ErrorCode.NO_CAPS_CONFIGURED,
            jobType !== undefined
              ? `No input validation caps are configured for job_type '${jobType}'`
              : 'Request does not specify a job_type with configured input validation caps',
            jobType !== undefined ? { job_type: jobType } : undefined
          )
        );
      return;
    }

    const violations = findCapViolations(caps, measure(req.body));
    if (violations.length > 0) {
      res
        .status(ERROR_HTTP_STATUS[ErrorCode.INPUT_CAP_EXCEEDED])
        .json(
          createErrorResponse(
            ErrorCode.INPUT_CAP_EXCEEDED,
            'One or more inputs exceed the configured caps for this job_type',
            { job_type: caps.job_type, violations }
          )
        );
      return;
    }

    next();
  };
}
