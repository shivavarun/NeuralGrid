/**
 * Output_Validator (dispatch-side result gating).
 *
 * Before the Job_Scheduler marks a Job COMPLETE, the provider result is checked
 * against the validation rule for the Job's `job_type` (Req 5.1). Rules are keyed
 * by output kind:
 *   - text       -> at least 1 non-whitespace character (Req 5.2)
 *   - image      -> non-empty and starts with a recognized PNG/JPEG/WEBP
 *                   magic-byte signature (Req 5.3)
 *   - embeddings -> valid JSON that parses as an array with >=1 numeric element
 *                   (Req 5.4)
 * A failed check, or a `job_type` with no configured rule, fails closed:
 * the Job is marked FAILED / INVALID_OUTPUT instead of COMPLETE and the original
 * provider result is retained for later retrieval (Req 5.5, 5.6).
 *
 * The pure per-kind validators carry no I/O and are independently testable; the
 * `job_type -> output kind` rule map is injected so callers can register the
 * kinds their deployment supports without editing this module.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { ErrorCode } from "@neuralgrid/shared";
import type {
  JobOutputKind,
  OutputValidator,
  ValidationOutcome,
} from "@neuralgrid/shared";

// --- Rule map: job_type -> output kind ---

/**
 * Maps a Job's `job_type` to the output kind whose validation rule applies.
 * A `job_type` absent from the map has no rule and fails closed (Req 5.6).
 */
export type OutputRuleMap = Readonly<Record<string, JobOutputKind>>;

/**
 * Default `job_type -> kind` associations. Injectable so a deployment can extend
 * or override the recognized job types; anything not listed fails closed.
 */
export const DEFAULT_OUTPUT_RULES: OutputRuleMap = {
  text: "text",
  chat: "text",
  completion: "text",
  image: "image",
  "text-to-image": "image",
  embeddings: "embeddings",
  embedding: "embeddings",
};

// --- Shared outcomes ---

export const VALID: ValidationOutcome = { valid: true };
export const INVALID: ValidationOutcome = {
  valid: false,
  error_code: ErrorCode.INVALID_OUTPUT,
};

// --- Result coercion ---

/** Normalize a `Buffer | string` result to a Buffer for byte-level checks. */
function toBuffer(result: Buffer | string): Buffer {
  return Buffer.isBuffer(result) ? result : Buffer.from(result, "utf8");
}

/** Normalize a `Buffer | string` result to a string for text/JSON checks. */
function toText(result: Buffer | string): string {
  return Buffer.isBuffer(result) ? result.toString("utf8") : result;
}

// --- Pure per-kind validators (no I/O; unit/property testable) ---

/** Text: at least one non-whitespace character remains after trimming (Req 5.2). */
export function isValidText(result: Buffer | string): boolean {
  return toText(result).trim().length >= 1;
}

// Recognized image magic-byte signatures (Req 5.3).
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_TAG = Buffer.from("RIFF", "ascii");
const WEBP_TAG = Buffer.from("WEBP", "ascii");

function startsWith(buf: Buffer, sig: Buffer): boolean {
  if (buf.length < sig.length) return false;
  return buf.subarray(0, sig.length).equals(sig);
}

/** WEBP is a RIFF container: `RIFF` at offset 0 and `WEBP` at offset 8. */
function isWebp(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return (
    buf.subarray(0, 4).equals(RIFF_TAG) && buf.subarray(8, 12).equals(WEBP_TAG)
  );
}

/**
 * Image: non-empty and begins with a recognized PNG, JPEG, or WEBP signature
 * (Req 5.3).
 */
export function isValidImage(result: Buffer | string): boolean {
  const buf = toBuffer(result);
  if (buf.length === 0) return false;
  return (
    startsWith(buf, PNG_SIGNATURE) ||
    startsWith(buf, JPEG_SIGNATURE) ||
    isWebp(buf)
  );
}

/**
 * Embeddings: valid JSON parsing to an array that holds at least one finite
 * numeric element (Req 5.4).
 */
export function isValidEmbeddings(result: Buffer | string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(toText(result));
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  return parsed.some((v) => typeof v === "number" && Number.isFinite(v));
}

/** Dispatch a validation by output kind. */
export function validateByKind(
  kind: JobOutputKind,
  result: Buffer | string
): boolean {
  switch (kind) {
    case "text":
      return isValidText(result);
    case "image":
      return isValidImage(result);
    case "embeddings":
      return isValidEmbeddings(result);
    default: {
      // Exhaustiveness guard: an unknown kind fails closed.
      const _never: never = kind;
      void _never;
      return false;
    }
  }
}

// --- Dispatcher-facing validator ---

/**
 * Output_Validator implementation. Resolves a `job_type` to its output kind via
 * the injected rule map, then applies the matching pure validator. A `job_type`
 * with no rule, or a result that fails its check, returns INVALID_OUTPUT so the
 * scheduler fails the Job closed (Req 5.5, 5.6).
 */
export class JobOutputValidator implements OutputValidator {
  constructor(private readonly rules: OutputRuleMap = DEFAULT_OUTPUT_RULES) {}

  /** Output kind for a `job_type`, or null when no rule is defined (Req 5.6). */
  kindFor(jobType: string): JobOutputKind | null {
    return this.rules[jobType] ?? null;
  }

  validate(job_type: string, result: Buffer | string): ValidationOutcome {
    const kind = this.kindFor(job_type);
    if (kind === null) {
      // No rule for this job_type: fail closed (Req 5.6).
      return INVALID;
    }
    return validateByKind(kind, result) ? VALID : INVALID;
  }
}

/**
 * Convenience one-shot validation against a rule map (defaults to
 * DEFAULT_OUTPUT_RULES). Equivalent to `new JobOutputValidator(rules).validate`.
 */
export function validateOutput(
  jobType: string,
  result: Buffer | string,
  rules: OutputRuleMap = DEFAULT_OUTPUT_RULES
): ValidationOutcome {
  return new JobOutputValidator(rules).validate(jobType, result);
}

// --- Completion gate orchestration (failure path wiring) ---

/**
 * Side-effecting collaborators for gating job completion on output validation.
 * Injected so the gate is testable without a real Job_Store or Billing_Service.
 */
export interface OutputValidationGateDeps {
  /** Mark a job FAILED with a terminal error_code (Req 5.5, 5.6). */
  markFailed(jobId: string, errorCode: ErrorCode): Promise<void>;
  /**
   * Post-charge failure hook (Req 9.1). Invoked after a job is failed with
   * INVALID_OUTPUT so the Billing_Service can synchronously refund a charged
   * job; a no-op for an uncharged job. Satisfied by the api-gateway auto-refund
   * handler (`createAutoRefundHandler`). Optional so a scheduler without billing
   * wiring is unaffected.
   */
  onPostChargeFailure?(jobId: string): Promise<unknown>;
}

/**
 * Gate a job's completion on Output_Validator success. On a valid result the
 * caller may proceed to mark the job COMPLETE; on an invalid result (or a
 * `job_type` with no rule), the job is marked FAILED / INVALID_OUTPUT — the
 * original provider result is retained by the caller for later retrieval
 * (Req 5.5, 5.6) — and the post-charge refund hook is invoked (Req 9.1).
 *
 * Returns the ValidationOutcome so the caller can branch on completion.
 */
export async function gateJobCompletion(
  jobId: string,
  jobType: string,
  result: Buffer | string,
  deps: OutputValidationGateDeps,
  validator: OutputValidator = new JobOutputValidator()
): Promise<ValidationOutcome> {
  const outcome = validator.validate(jobType, result);
  if (outcome.valid) {
    return outcome;
  }

  await deps.markFailed(jobId, ErrorCode.INVALID_OUTPUT);
  // Synchronously refund iff the job was charged (Req 9.1).
  if (deps.onPostChargeFailure) {
    await deps.onPostChargeFailure(jobId);
  }
  return outcome;
}
