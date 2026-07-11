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
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  createErrorResponse,
  type AdminSession,
} from '@neuralgrid/shared';

// --- Constants -------------------------------------------------------------

/** Admin_Session maximum age for mutations: 12 hours (Req 13.3). */
export const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** HTTP methods that constitute an admin *mutation* (Req 13.3). */
const MUTATION_METHODS: ReadonlySet<string> = new Set([
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

// --- Injectable dependencies ----------------------------------------------

/** Time source, injected so age boundaries are deterministic in tests. */
export type Clock = () => number;

/** Default clock: wall-clock epoch milliseconds. */
export const systemClock: Clock = () => Date.now();

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

// --- Request augmentation --------------------------------------------------

/** Express Request carrying the resolved Admin_Session for downstream handlers. */
export interface AdminAuthenticatedRequest extends Request {
  adminSession?: AdminSession;
}

// --- Pure logic (independently testable) -----------------------------------

/** True iff `method` (case-insensitive) is an admin mutation verb. */
export function isMutationMethod(method: string): boolean {
  return MUTATION_METHODS.has(method.toUpperCase());
}

/** True iff the session's role is exactly `admin`. */
export function isAdminRole(session: Pick<AdminSession, 'role'> | null | undefined): boolean {
  return session?.role === 'admin';
}

/** Age of an Admin_Session in milliseconds, measured from `last_auth_at`. */
export function sessionAgeMs(session: AdminSession, now: number): number {
  return now - new Date(session.last_auth_at).getTime();
}

/**
 * True iff the session is too old to authorize a mutation. The boundary is
 * exclusive: an age of exactly `maxAgeMs` is still valid; only `> maxAgeMs`
 * is stale (Req 13.3 — "exceeds 12 hours").
 */
export function isSessionStale(
  session: AdminSession,
  now: number,
  maxAgeMs: number = ADMIN_SESSION_MAX_AGE_MS
): boolean {
  return sessionAgeMs(session, now) > maxAgeMs;
}

/** Outcome of evaluating an admin request against RBAC + session-age rules. */
export type AdminAccessDecision =
  | { allow: true; session: AdminSession }
  | { allow: false; code: ErrorCode.ADMIN_FORBIDDEN | ErrorCode.REAUTH_REQUIRED };

/**
 * Pure authorization decision for an admin request.
 *  - No session or non-admin role                 -> ADMIN_FORBIDDEN (403)
 *  - Mutation method + session age > 12h           -> REAUTH_REQUIRED (401)
 *  - Otherwise                                     -> allow
 */
export function decideAdminAccess(
  session: AdminSession | null,
  method: string,
  now: number,
  maxAgeMs: number = ADMIN_SESSION_MAX_AGE_MS
): AdminAccessDecision {
  if (!isAdminRole(session)) {
    return { allow: false, code: ErrorCode.ADMIN_FORBIDDEN };
  }
  // Non-null asserted: isAdminRole guarantees a session here.
  const s = session as AdminSession;
  if (isMutationMethod(method) && isSessionStale(s, now, maxAgeMs)) {
    return { allow: false, code: ErrorCode.REAUTH_REQUIRED };
  }
  return { allow: true, session: s };
}

// --- Express middleware -----------------------------------------------------

function sendError(res: Response, code: ErrorCode, message: string): void {
  res.status(ERROR_HTTP_STATUS[code]).json(createErrorResponse(code, message));
}

/**
 * Admin route guard. Attach to every admin route. Enforces server-side RBAC
 * (403 for non-admin) and, for mutations, the 12h session-age re-auth rule
 * (401). On rejection it returns before `next()`, so the route handler never
 * runs and no data is mutated (Req 13.2, 13.3).
 */
export function createAdminAuthMiddleware(deps: AdminAuthDeps) {
  const clock = deps.clock ?? systemClock;
  return async (
    req: AdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const session = await deps.sessionLookup.getSession(req);
    const decision = decideAdminAccess(session, req.method, clock());

    if (!decision.allow) {
      if (decision.code === ErrorCode.ADMIN_FORBIDDEN) {
        sendError(res, ErrorCode.ADMIN_FORBIDDEN, 'Admin role required');
      } else {
        sendError(
          res,
          ErrorCode.REAUTH_REQUIRED,
          'Admin session expired; re-authentication required'
        );
      }
      return;
    }

    req.adminSession = decision.session;
    next();
  };
}

/** Result of a re-authentication attempt. */
export type ReauthResult =
  | { ok: true; session: AdminSession }
  | { ok: false };

/**
 * Pure-ish re-auth resolution: delegates credential verification to the
 * injected `Reauthenticator` and reports whether a fresh session was minted.
 * On failure no session is produced, so callers establish nothing (Req 13.5).
 */
export async function performReauth(
  reauth: Reauthenticator,
  req: Request,
  now: number
): Promise<ReauthResult> {
  const session = await reauth.reauthenticate(req, now);
  if (!session) {
    return { ok: false };
  }
  return { ok: true, session };
}

/**
 * Express handler for the admin re-authentication endpoint. On success it
 * hands the caller a fresh Admin_Session (age zero) via `onEstablish` so the
 * transport can persist/emit it; on failure it returns 401 and establishes
 * nothing (Req 13.4, 13.5).
 */
export function createReauthHandler(
  reauth: Reauthenticator,
  onEstablish: (req: Request, res: Response, session: AdminSession) => void,
  clock: Clock = systemClock
) {
  return async (req: Request, res: Response): Promise<void> => {
    const result = await performReauth(reauth, req, clock());
    if (!result.ok) {
      sendError(res, ErrorCode.REAUTH_REQUIRED, 'Re-authentication failed');
      return;
    }
    onEstablish(req, res, result.session);
  };
}
