"use strict";
/**
 * Inbound signature + replay verification for Stripe_Webhook events and
 * provider result callbacks (Requirement 14).
 *
 * Responsibilities:
 *  - Verify a Stripe_Webhook signature against the Stripe signing secret
 *    (Req 14.1) and a Provider_Callback_Signature against the shared HMAC
 *    secret (Req 14.3), both using HMAC-SHA256 with a constant-time compare.
 *  - Treat an unsigned request (missing signature header) exactly like a
 *    failed verification (Req 14.5).
 *  - Reject a request whose timestamp differs from the current time by more
 *    than 300s as a replay (Req 14.6).
 *  - On rejection, respond WITHOUT revealing the secret or verification
 *    details, and leave all prior Job and billing state unchanged (Req 14.2,
 *    14.4, 14.7) — the middleware short-circuits before any handler runs.
 *
 * Design: the decision logic is pure and framework-free (`verifyStripeInbound`,
 * `verifyProviderInbound`, `constantTimeEqual`, `isReplay`) so it can be
 * property/unit tested in isolation. The Express wrappers only adapt a raw
 * request into a `SignedInbound` and translate a `VerifyResult` into a
 * response. The raw (unparsed) body bytes are required for Stripe because the
 * signed payload is computed over the exact bytes Stripe sent.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVIDER_TIMESTAMP_HEADER = exports.PROVIDER_SIGNATURE_HEADER = exports.STRIPE_SIGNATURE_HEADER = exports.REPLAY_WINDOW_SECONDS = void 0;
exports.constantTimeEqual = constantTimeEqual;
exports.hmacSha256Hex = hmacSha256Hex;
exports.isReplay = isReplay;
exports.parseStripeSignatureHeader = parseStripeSignatureHeader;
exports.verifyStripeInbound = verifyStripeInbound;
exports.verifyProviderInbound = verifyProviderInbound;
exports.createStripeSignatureMiddleware = createStripeSignatureMiddleware;
exports.createProviderSignatureMiddleware = createProviderSignatureMiddleware;
const crypto_1 = require("crypto");
const shared_1 = require("@neuralgrid/shared");
// --- Constants ---
/** Replay window: reject if |now - timestamp| exceeds this many seconds. */
exports.REPLAY_WINDOW_SECONDS = 300;
/** Stripe signature header (`Stripe-Signature`). */
exports.STRIPE_SIGNATURE_HEADER = 'Stripe-Signature';
/** Provider callback HMAC signature header. */
exports.PROVIDER_SIGNATURE_HEADER = 'Provider-Callback-Signature';
/** Provider callback timestamp header (unix seconds). */
exports.PROVIDER_TIMESTAMP_HEADER = 'Provider-Callback-Timestamp';
// --- Pure primitives ---
/**
 * Constant-time comparison of two candidate signatures given as hex strings.
 * Returns false for any length mismatch (without leaking where they differ)
 * and never throws on malformed input. Uses `timingSafeEqual` so a partial
 * prefix match is not observable via timing.
 */
function constantTimeEqual(a, b) {
    // Compare the raw bytes of the two strings. Different byte lengths can never
    // be equal; bail early but only on length, which reveals nothing about the
    // secret's contents.
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
        return false;
    }
    try {
        return (0, crypto_1.timingSafeEqual)(bufA, bufB);
    }
    catch {
        return false;
    }
}
/** HMAC-SHA256 of `payload` under `secret`, returned as lowercase hex. */
function hmacSha256Hex(secret, payload) {
    return (0, crypto_1.createHmac)('sha256', secret).update(payload).digest('hex');
}
/**
 * Replay-window check (Req 14.6). A request is a replay if its timestamp is
 * more than REPLAY_WINDOW_SECONDS away from `now` in either direction.
 *
 * @param timestamp inbound request timestamp, in unix seconds
 * @param nowMs     current time in ms epoch (defaults to Date.now())
 */
function isReplay(timestamp, nowMs = Date.now(), windowSeconds = exports.REPLAY_WINDOW_SECONDS) {
    if (!Number.isFinite(timestamp)) {
        // A non-numeric / missing timestamp can't be proven in-window -> treat as
        // a replay so it is rejected rather than admitted.
        return true;
    }
    const nowSeconds = nowMs / 1000;
    return Math.abs(nowSeconds - timestamp) > windowSeconds;
}
/**
 * Parse a `Stripe-Signature` header of the form `t=<ts>,v1=<sig>[,v1=<sig>]`.
 * Returns null when the header is malformed or missing a `t` / `v1` field.
 */
function parseStripeSignatureHeader(header) {
    if (!header)
        return null;
    let timestamp;
    const signatures = [];
    for (const part of header.split(',')) {
        const eq = part.indexOf('=');
        if (eq === -1)
            continue;
        const scheme = part.slice(0, eq).trim();
        const value = part.slice(eq + 1).trim();
        if (scheme === 't') {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed))
                timestamp = parsed;
        }
        else if (scheme === 'v1') {
            if (value.length > 0)
                signatures.push(value);
        }
    }
    if (timestamp === undefined || signatures.length === 0) {
        return null;
    }
    return { timestamp, signatures };
}
// --- Verification decisions (pure, framework-free) ---
/**
 * Verify a Stripe_Webhook (Req 14.1, 14.2, 14.5, 14.6).
 *
 * Order of checks:
 *  1. Missing signature header            -> { ok:false, reason:'missing' }
 *  2. Unparseable / no v1 signature        -> { ok:false, reason:'missing' }
 *  3. Timestamp outside the replay window  -> { ok:false, reason:'replay' }
 *  4. No v1 signature matches the expected  -> { ok:false, reason:'invalid' }
 *
 * The signed payload is `${t}.${raw_body}` per Stripe's scheme, computed over
 * the exact received bytes.
 */
function verifyStripeInbound(signed, signingSecret, nowMs = Date.now()) {
    if (!signed.signature_header) {
        return { ok: false, reason: 'missing' };
    }
    const parsed = parseStripeSignatureHeader(signed.signature_header);
    if (!parsed) {
        return { ok: false, reason: 'missing' };
    }
    if (isReplay(parsed.timestamp, nowMs)) {
        return { ok: false, reason: 'replay' };
    }
    const signedPayload = Buffer.concat([
        Buffer.from(`${parsed.timestamp}.`, 'utf8'),
        signed.raw_body,
    ]);
    const expected = hmacSha256Hex(signingSecret, signedPayload);
    const matched = parsed.signatures.some((candidate) => constantTimeEqual(candidate, expected));
    return matched ? { ok: true } : { ok: false, reason: 'invalid' };
}
/**
 * Verify a provider result callback (Req 14.3, 14.4, 14.5, 14.6).
 *
 * The provider signs `${timestamp}.${raw_body}` with the shared HMAC secret
 * and sends the hex digest in `Provider-Callback-Signature`. The timestamp on
 * `SignedInbound` is authenticated as part of the signed payload, so an
 * attacker cannot both slide the timestamp into the window and keep the
 * signature valid.
 */
function verifyProviderInbound(signed, sharedSecret, nowMs = Date.now()) {
    if (!signed.signature_header) {
        return { ok: false, reason: 'missing' };
    }
    if (isReplay(signed.timestamp, nowMs)) {
        return { ok: false, reason: 'replay' };
    }
    const signedPayload = Buffer.concat([
        Buffer.from(`${signed.timestamp}.`, 'utf8'),
        signed.raw_body,
    ]);
    const expected = hmacSha256Hex(sharedSecret, signedPayload);
    return constantTimeEqual(signed.signature_header, expected)
        ? { ok: true }
        : { ok: false, reason: 'invalid' };
}
/** Extract raw body bytes from the request, tolerating Buffer or string. */
function extractRawBody(req) {
    if (Buffer.isBuffer(req.rawBody))
        return req.rawBody;
    if (Buffer.isBuffer(req.body))
        return req.body;
    if (typeof req.body === 'string')
        return Buffer.from(req.body, 'utf8');
    // Last resort: re-serialize a parsed body. Prefer configuring express.raw so
    // this branch is never taken for signature-verified routes.
    return Buffer.from(req.body ? JSON.stringify(req.body) : '', 'utf8');
}
/**
 * Send a uniform rejection response. Crucially, the body reveals neither the
 * secret nor which check failed beyond a generic code, and no handler runs, so
 * all prior Job and billing state is left unchanged (Req 14.2, 14.4, 14.7).
 */
function rejectInbound(res) {
    const status = shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.SIGNATURE_INVALID];
    res
        .status(status)
        .json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.SIGNATURE_INVALID, 'Request signature verification failed'));
}
/**
 * Express middleware verifying inbound Stripe webhooks. Mount with a raw body
 * parser so `req.rawBody` (or `req.body` as a Buffer) holds the exact bytes.
 */
function createStripeSignatureMiddleware(signingSecret) {
    return (req, res, next) => {
        const signed = {
            raw_body: extractRawBody(req),
            signature_header: req.header(exports.STRIPE_SIGNATURE_HEADER) ?? undefined,
            // Stripe's authoritative timestamp lives inside the signature header; the
            // pure verifier parses it. This field is unused for Stripe but kept for
            // the shared SignedInbound shape.
            timestamp: Number.parseInt(req.header(exports.PROVIDER_TIMESTAMP_HEADER) ?? '0', 10),
        };
        const result = verifyStripeInbound(signed, signingSecret);
        if (!result.ok) {
            rejectInbound(res);
            return;
        }
        next();
    };
}
/**
 * Express middleware verifying inbound provider result callbacks. Mount with a
 * raw body parser so the HMAC is computed over the exact received bytes.
 */
function createProviderSignatureMiddleware(sharedSecret) {
    return (req, res, next) => {
        const signed = {
            raw_body: extractRawBody(req),
            signature_header: req.header(exports.PROVIDER_SIGNATURE_HEADER) ?? undefined,
            timestamp: Number.parseInt(req.header(exports.PROVIDER_TIMESTAMP_HEADER) ?? 'NaN', 10),
        };
        const result = verifyProviderInbound(signed, sharedSecret);
        if (!result.ok) {
            rejectInbound(res);
            return;
        }
        next();
    };
}
//# sourceMappingURL=signatureVerification.js.map