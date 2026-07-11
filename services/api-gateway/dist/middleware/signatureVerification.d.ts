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
import type { Request, Response, NextFunction } from 'express';
import type { SignedInbound, VerifyResult } from '@neuralgrid/shared';
/** Replay window: reject if |now - timestamp| exceeds this many seconds. */
export declare const REPLAY_WINDOW_SECONDS = 300;
/** Stripe signature header (`Stripe-Signature`). */
export declare const STRIPE_SIGNATURE_HEADER = "Stripe-Signature";
/** Provider callback HMAC signature header. */
export declare const PROVIDER_SIGNATURE_HEADER = "Provider-Callback-Signature";
/** Provider callback timestamp header (unix seconds). */
export declare const PROVIDER_TIMESTAMP_HEADER = "Provider-Callback-Timestamp";
/**
 * Constant-time comparison of two candidate signatures given as hex strings.
 * Returns false for any length mismatch (without leaking where they differ)
 * and never throws on malformed input. Uses `timingSafeEqual` so a partial
 * prefix match is not observable via timing.
 */
export declare function constantTimeEqual(a: string, b: string): boolean;
/** HMAC-SHA256 of `payload` under `secret`, returned as lowercase hex. */
export declare function hmacSha256Hex(secret: string, payload: string | Buffer): string;
/**
 * Replay-window check (Req 14.6). A request is a replay if its timestamp is
 * more than REPLAY_WINDOW_SECONDS away from `now` in either direction.
 *
 * @param timestamp inbound request timestamp, in unix seconds
 * @param nowMs     current time in ms epoch (defaults to Date.now())
 */
export declare function isReplay(timestamp: number, nowMs?: number, windowSeconds?: number): boolean;
export interface StripeSignatureParts {
    timestamp: number;
    signatures: string[];
}
/**
 * Parse a `Stripe-Signature` header of the form `t=<ts>,v1=<sig>[,v1=<sig>]`.
 * Returns null when the header is malformed or missing a `t` / `v1` field.
 */
export declare function parseStripeSignatureHeader(header: string | undefined): StripeSignatureParts | null;
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
export declare function verifyStripeInbound(signed: SignedInbound, signingSecret: string, nowMs?: number): VerifyResult;
/**
 * Verify a provider result callback (Req 14.3, 14.4, 14.5, 14.6).
 *
 * The provider signs `${timestamp}.${raw_body}` with the shared HMAC secret
 * and sends the hex digest in `Provider-Callback-Signature`. The timestamp on
 * `SignedInbound` is authenticated as part of the signed payload, so an
 * attacker cannot both slide the timestamp into the window and keep the
 * signature valid.
 */
export declare function verifyProviderInbound(signed: SignedInbound, sharedSecret: string, nowMs?: number): VerifyResult;
/**
 * A request carrying the exact raw body bytes. Populate via
 * a catch-all `express.raw` body parser on the webhook/callback routes (Stripe
 * signature verification requires the unparsed bytes).
 */
export interface RawBodyRequest extends Request {
    rawBody?: Buffer;
}
/**
 * Express middleware verifying inbound Stripe webhooks. Mount with a raw body
 * parser so `req.rawBody` (or `req.body` as a Buffer) holds the exact bytes.
 */
export declare function createStripeSignatureMiddleware(signingSecret: string): (req: RawBodyRequest, res: Response, next: NextFunction) => void;
/**
 * Express middleware verifying inbound provider result callbacks. Mount with a
 * raw body parser so the HMAC is computed over the exact received bytes.
 */
export declare function createProviderSignatureMiddleware(sharedSecret: string): (req: RawBodyRequest, res: Response, next: NextFunction) => void;
