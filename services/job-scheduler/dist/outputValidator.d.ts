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
import type { JobOutputKind, OutputValidator, ValidationOutcome } from "@neuralgrid/shared";
/**
 * Maps a Job's `job_type` to the output kind whose validation rule applies.
 * A `job_type` absent from the map has no rule and fails closed (Req 5.6).
 */
export type OutputRuleMap = Readonly<Record<string, JobOutputKind>>;
/**
 * Default `job_type -> kind` associations. Injectable so a deployment can extend
 * or override the recognized job types; anything not listed fails closed.
 */
export declare const DEFAULT_OUTPUT_RULES: OutputRuleMap;
export declare const VALID: ValidationOutcome;
export declare const INVALID: ValidationOutcome;
/** Text: at least one non-whitespace character remains after trimming (Req 5.2). */
export declare function isValidText(result: Buffer | string): boolean;
/**
 * Image: non-empty and begins with a recognized PNG, JPEG, or WEBP signature
 * (Req 5.3).
 */
export declare function isValidImage(result: Buffer | string): boolean;
/**
 * Embeddings: valid JSON parsing to an array that holds at least one finite
 * numeric element (Req 5.4).
 */
export declare function isValidEmbeddings(result: Buffer | string): boolean;
/** Dispatch a validation by output kind. */
export declare function validateByKind(kind: JobOutputKind, result: Buffer | string): boolean;
/**
 * Output_Validator implementation. Resolves a `job_type` to its output kind via
 * the injected rule map, then applies the matching pure validator. A `job_type`
 * with no rule, or a result that fails its check, returns INVALID_OUTPUT so the
 * scheduler fails the Job closed (Req 5.5, 5.6).
 */
export declare class JobOutputValidator implements OutputValidator {
    private readonly rules;
    constructor(rules?: OutputRuleMap);
    /** Output kind for a `job_type`, or null when no rule is defined (Req 5.6). */
    kindFor(jobType: string): JobOutputKind | null;
    validate(job_type: string, result: Buffer | string): ValidationOutcome;
}
/**
 * Convenience one-shot validation against a rule map (defaults to
 * DEFAULT_OUTPUT_RULES). Equivalent to `new JobOutputValidator(rules).validate`.
 */
export declare function validateOutput(jobType: string, result: Buffer | string, rules?: OutputRuleMap): ValidationOutcome;
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
export declare function gateJobCompletion(jobId: string, jobType: string, result: Buffer | string, deps: OutputValidationGateDeps, validator?: OutputValidator): Promise<ValidationOutcome>;
