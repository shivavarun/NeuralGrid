"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.systemClock = exports.ADMIN_SESSION_MAX_AGE_MS = void 0;
exports.isMutationMethod = isMutationMethod;
exports.isAdminRole = isAdminRole;
exports.sessionAgeMs = sessionAgeMs;
exports.isSessionStale = isSessionStale;
exports.decideAdminAccess = decideAdminAccess;
exports.createAdminAuthMiddleware = createAdminAuthMiddleware;
exports.performReauth = performReauth;
exports.createReauthHandler = createReauthHandler;
const shared_1 = require("@neuralgrid/shared");
// --- Constants -------------------------------------------------------------
/** Admin_Session maximum age for mutations: 12 hours (Req 13.3). */
exports.ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** HTTP methods that constitute an admin *mutation* (Req 13.3). */
const MUTATION_METHODS = new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
]);
/** Default clock: wall-clock epoch milliseconds. */
const systemClock = () => Date.now();
exports.systemClock = systemClock;
// --- Pure logic (independently testable) -----------------------------------
/** True iff `method` (case-insensitive) is an admin mutation verb. */
function isMutationMethod(method) {
    return MUTATION_METHODS.has(method.toUpperCase());
}
/** True iff the session's role is exactly `admin`. */
function isAdminRole(session) {
    return session?.role === 'admin';
}
/** Age of an Admin_Session in milliseconds, measured from `last_auth_at`. */
function sessionAgeMs(session, now) {
    return now - new Date(session.last_auth_at).getTime();
}
/**
 * True iff the session is too old to authorize a mutation. The boundary is
 * exclusive: an age of exactly `maxAgeMs` is still valid; only `> maxAgeMs`
 * is stale (Req 13.3 — "exceeds 12 hours").
 */
function isSessionStale(session, now, maxAgeMs = exports.ADMIN_SESSION_MAX_AGE_MS) {
    return sessionAgeMs(session, now) > maxAgeMs;
}
/**
 * Pure authorization decision for an admin request.
 *  - No session or non-admin role                 -> ADMIN_FORBIDDEN (403)
 *  - Mutation method + session age > 12h           -> REAUTH_REQUIRED (401)
 *  - Otherwise                                     -> allow
 */
function decideAdminAccess(session, method, now, maxAgeMs = exports.ADMIN_SESSION_MAX_AGE_MS) {
    if (!isAdminRole(session)) {
        return { allow: false, code: shared_1.ErrorCode.ADMIN_FORBIDDEN };
    }
    // Non-null asserted: isAdminRole guarantees a session here.
    const s = session;
    if (isMutationMethod(method) && isSessionStale(s, now, maxAgeMs)) {
        return { allow: false, code: shared_1.ErrorCode.REAUTH_REQUIRED };
    }
    return { allow: true, session: s };
}
// --- Express middleware -----------------------------------------------------
function sendError(res, code, message) {
    res.status(shared_1.ERROR_HTTP_STATUS[code]).json((0, shared_1.createErrorResponse)(code, message));
}
/**
 * Admin route guard. Attach to every admin route. Enforces server-side RBAC
 * (403 for non-admin) and, for mutations, the 12h session-age re-auth rule
 * (401). On rejection it returns before `next()`, so the route handler never
 * runs and no data is mutated (Req 13.2, 13.3).
 */
function createAdminAuthMiddleware(deps) {
    const clock = deps.clock ?? exports.systemClock;
    return async (req, res, next) => {
        const session = await deps.sessionLookup.getSession(req);
        const decision = decideAdminAccess(session, req.method, clock());
        if (!decision.allow) {
            if (decision.code === shared_1.ErrorCode.ADMIN_FORBIDDEN) {
                sendError(res, shared_1.ErrorCode.ADMIN_FORBIDDEN, 'Admin role required');
            }
            else {
                sendError(res, shared_1.ErrorCode.REAUTH_REQUIRED, 'Admin session expired; re-authentication required');
            }
            return;
        }
        req.adminSession = decision.session;
        next();
    };
}
/**
 * Pure-ish re-auth resolution: delegates credential verification to the
 * injected `Reauthenticator` and reports whether a fresh session was minted.
 * On failure no session is produced, so callers establish nothing (Req 13.5).
 */
async function performReauth(reauth, req, now) {
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
function createReauthHandler(reauth, onEstablish, clock = exports.systemClock) {
    return async (req, res) => {
        const result = await performReauth(reauth, req, clock());
        if (!result.ok) {
            sendError(res, shared_1.ErrorCode.REAUTH_REQUIRED, 'Re-authentication failed');
            return;
        }
        onEstablish(req, res, result.session);
    };
}
//# sourceMappingURL=adminAuth.js.map