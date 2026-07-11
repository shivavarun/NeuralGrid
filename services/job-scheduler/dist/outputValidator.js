"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobOutputValidator = exports.INVALID = exports.VALID = exports.DEFAULT_OUTPUT_RULES = void 0;
exports.isValidText = isValidText;
exports.isValidImage = isValidImage;
exports.isValidEmbeddings = isValidEmbeddings;
exports.validateByKind = validateByKind;
exports.validateOutput = validateOutput;
exports.gateJobCompletion = gateJobCompletion;
const shared_1 = require("@neuralgrid/shared");
/**
 * Default `job_type -> kind` associations. Injectable so a deployment can extend
 * or override the recognized job types; anything not listed fails closed.
 */
exports.DEFAULT_OUTPUT_RULES = {
    text: "text",
    chat: "text",
    completion: "text",
    image: "image",
    "text-to-image": "image",
    embeddings: "embeddings",
    embedding: "embeddings",
};
// --- Shared outcomes ---
exports.VALID = { valid: true };
exports.INVALID = {
    valid: false,
    error_code: shared_1.ErrorCode.INVALID_OUTPUT,
};
// --- Result coercion ---
/** Normalize a `Buffer | string` result to a Buffer for byte-level checks. */
function toBuffer(result) {
    return Buffer.isBuffer(result) ? result : Buffer.from(result, "utf8");
}
/** Normalize a `Buffer | string` result to a string for text/JSON checks. */
function toText(result) {
    return Buffer.isBuffer(result) ? result.toString("utf8") : result;
}
// --- Pure per-kind validators (no I/O; unit/property testable) ---
/** Text: at least one non-whitespace character remains after trimming (Req 5.2). */
function isValidText(result) {
    return toText(result).trim().length >= 1;
}
// Recognized image magic-byte signatures (Req 5.3).
const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_TAG = Buffer.from("RIFF", "ascii");
const WEBP_TAG = Buffer.from("WEBP", "ascii");
function startsWith(buf, sig) {
    if (buf.length < sig.length)
        return false;
    return buf.subarray(0, sig.length).equals(sig);
}
/** WEBP is a RIFF container: `RIFF` at offset 0 and `WEBP` at offset 8. */
function isWebp(buf) {
    if (buf.length < 12)
        return false;
    return (buf.subarray(0, 4).equals(RIFF_TAG) && buf.subarray(8, 12).equals(WEBP_TAG));
}
/**
 * Image: non-empty and begins with a recognized PNG, JPEG, or WEBP signature
 * (Req 5.3).
 */
function isValidImage(result) {
    const buf = toBuffer(result);
    if (buf.length === 0)
        return false;
    return (startsWith(buf, PNG_SIGNATURE) ||
        startsWith(buf, JPEG_SIGNATURE) ||
        isWebp(buf));
}
/**
 * Embeddings: valid JSON parsing to an array that holds at least one finite
 * numeric element (Req 5.4).
 */
function isValidEmbeddings(result) {
    let parsed;
    try {
        parsed = JSON.parse(toText(result));
    }
    catch {
        return false;
    }
    if (!Array.isArray(parsed))
        return false;
    return parsed.some((v) => typeof v === "number" && Number.isFinite(v));
}
/** Dispatch a validation by output kind. */
function validateByKind(kind, result) {
    switch (kind) {
        case "text":
            return isValidText(result);
        case "image":
            return isValidImage(result);
        case "embeddings":
            return isValidEmbeddings(result);
        default: {
            // Exhaustiveness guard: an unknown kind fails closed.
            const _never = kind;
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
class JobOutputValidator {
    constructor(rules = exports.DEFAULT_OUTPUT_RULES) {
        this.rules = rules;
    }
    /** Output kind for a `job_type`, or null when no rule is defined (Req 5.6). */
    kindFor(jobType) {
        return this.rules[jobType] ?? null;
    }
    validate(job_type, result) {
        const kind = this.kindFor(job_type);
        if (kind === null) {
            // No rule for this job_type: fail closed (Req 5.6).
            return exports.INVALID;
        }
        return validateByKind(kind, result) ? exports.VALID : exports.INVALID;
    }
}
exports.JobOutputValidator = JobOutputValidator;
/**
 * Convenience one-shot validation against a rule map (defaults to
 * DEFAULT_OUTPUT_RULES). Equivalent to `new JobOutputValidator(rules).validate`.
 */
function validateOutput(jobType, result, rules = exports.DEFAULT_OUTPUT_RULES) {
    return new JobOutputValidator(rules).validate(jobType, result);
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
async function gateJobCompletion(jobId, jobType, result, deps, validator = new JobOutputValidator()) {
    const outcome = validator.validate(jobType, result);
    if (outcome.valid) {
        return outcome;
    }
    await deps.markFailed(jobId, shared_1.ErrorCode.INVALID_OUTPUT);
    // Synchronously refund iff the job was charged (Req 9.1).
    if (deps.onPostChargeFailure) {
        await deps.onPostChargeFailure(jobId);
    }
    return outcome;
}
//# sourceMappingURL=outputValidator.js.map