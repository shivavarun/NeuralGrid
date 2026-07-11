/**
 * Admin RBAC guard + Admin_Session re-authentication (Requirement 13).
 *
 * Responsibilities:
 *  - Verify server-side that the requesting user's role is `admin` on EVERY
 *    admin route; non-admin -> 403 ADMIN_FORBIDDEN, request not processed
 *    (Req 13.1, 13.2).
 *  - For admin mutations (POST/PUT/PATCH/DELETE), reject with 401
 *    REAUTH_REQUIRED when the Admin_Session age (now - last_auth_at) exceeds
 *    12h, leaving all data unchanged (Req 13.3).
 *  - On successful re-auth, establish a NEW session with age reset to zero
 *    (Req 13.4); on failed re-auth, return 401 without establishing a session
 *    (Req 13.5).
 *
 * The HTTP-facing pieces are thin wrappers over pure logic (session-age check,
 * is-mutation check) and injectable dependencies (clock + session lookup) so
 * the whole guard is unit- and property-testable without Express plumbing.
 */
import type { Request, Response, NextFunction } from 'express';
import { ErrorCode, type AdminSession } from '@neuralgrid/shared';
/** Admin_Session maximum age for mutations: 12 hours (Req 13.3). */
export declare const ADMIN_SESSION_MAX_AGE_MS: number;
/** Time source, injected so age boundaries are deterministic in tests. */
export type Clock = () => number;
/** Default clock: wall-clock epoch milliseconds. */
export declare const systemClock: Clock;
/**
 * Resolves the Admin_Session for an inbound request (e.g. from a session
 * cookie/token). Returns `null` when no session is associated with the request.
 */
export interface SessionLookup {
    getSession(req: Request): Promise<AdminSession | null>;
}
/**
 * Verifies re-authentication credentials and, on success, mints a fresh
 * Admin_Session whose `last_auth_at` is set to the supplied time so its age is
 * zero (Req 13.4). Returns `null` on failure so no session is established
 * (Req 13.5).
 */
export interface Reauthenticator {
    reauthenticate(req: Request, now: number): Promise<AdminSession | null>;
}
export interface AdminAuthDeps {
    sessionLookup: SessionLookup;
    clock?: Clock;
}
/** Express Request carrying the resolved Admin_Session for downstream handlers. */
export interface AdminAuthenticatedRequest extends Request {
    adminSession?: AdminSession;
}
/** True iff `method` (case-insensitive) is an admin mutation verb. */
export declare function isMutationMethod(method: string): boolean;
/** True iff the session's role is exactly `admin`. */
export declare function isAdminRole(session: Pick<AdminSession, 'role'> | null | undefined): boolean;
/** Age of an Admin_Session in milliseconds, measured from `last_auth_at`. */
export declare function sessionAgeMs(session: AdminSession, now: number): number;
/**
 * True iff the session is too old to authorize a mutation. The boundary is
 * exclusive: an age of exactly `maxAgeMs` is still valid; only `> maxAgeMs`
 * is stale (Req 13.3 — "exceeds 12 hours").
 */
export declare function isSessionStale(session: AdminSession, now: number, maxAgeMs?: number): boolean;
/** Outcome of evaluating an admin request against RBAC + session-age rules. */
export type AdminAccessDecision = {
    allow: true;
    session: AdminSession;
} | {
    allow: false;
    code: ErrorCode.ADMIN_FORBIDDEN | ErrorCode.REAUTH_REQUIRED;
};
/**
 * Pure authorization decision for an admin request.
 *  - No session or non-admin role                 -> ADMIN_FORBIDDEN (403)
 *  - Mutation method + session age > 12h           -> REAUTH_REQUIRED (401)
 *  - Otherwise                                     -> allow
 */
export declare function decideAdminAccess(session: AdminSession | null, method: string, now: number, maxAgeMs?: number): AdminAccessDecision;
/**
 * Admin route guard. Attach to every admin route. Enforces server-side RBAC
 * (403 for non-admin) and, for mutations, the 12h session-age re-auth rule
 * (401). On rejection it returns before `next()`, so the route handler never
 * runs and no data is mutated (Req 13.2, 13.3).
 */
export declare function createAdminAuthMiddleware(deps: AdminAuthDeps): (req: AdminAuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
/** Result of a re-authentication attempt. */
export type ReauthResult = {
    ok: true;
    session: AdminSession;
} | {
    ok: false;
};
/**
 * Pure-ish re-auth resolution: delegates credential verification to the
 * injected `Reauthenticator` and reports whether a fresh session was minted.
 * On failure no session is produced, so callers establish nothing (Req 13.5).
 */
export declare function performReauth(reauth: Reauthenticator, req: Request, now: number): Promise<ReauthResult>;
/**
 * Express handler for the admin re-authentication endpoint. On success it
 * hands the caller a fresh Admin_Session (age zero) via `onEstablish` so the
 * transport can persist/emit it; on failure it returns 401 and establishes
 * nothing (Req 13.4, 13.5).
 */
export declare function createReauthHandler(reauth: Reauthenticator, onEstablish: (req: Request, res: Response, session: AdminSession) => void, clock?: Clock): (req: Request, res: Response) => Promise<void>;
