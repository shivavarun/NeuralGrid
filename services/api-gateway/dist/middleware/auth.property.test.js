"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fast_check_1 = __importDefault(require("fast-check"));
const auth_1 = require("./auth");
const shared_1 = require("@neuralgrid/shared");
/**
 * Property 7: Authentication Enforcement
 * For any request with missing, malformed, or invalid Authorization header,
 * verify 401 UNAUTHORIZED response.
 *
 * Validates: Requirements 1.3, 9.1, 9.2
 */
function mockResponse() {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
}
function mockRequest(headers = {}) {
    return { headers };
}
function rejectingKeyStore() {
    return {
        findActiveKeyByHash: vitest_1.vi.fn().mockResolvedValue(null),
    };
}
(0, vitest_1.describe)('Feature: neuralgrid-mvp, Property 7: Authentication Enforcement', () => {
    /**
     * **Validates: Requirements 1.3, 9.1, 9.2**
     *
     * For any random string that does NOT start with "Bearer ",
     * the middleware must return 401 UNAUTHORIZED.
     */
    (0, vitest_1.it)('rejects authorization headers without Bearer prefix', async () => {
        const keyStore = rejectingKeyStore();
        const middleware = (0, auth_1.createAuthMiddleware)(keyStore);
        const next = vitest_1.vi.fn();
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.string({ minLength: 1 }).filter((s) => !s.startsWith('Bearer ')), async (headerValue) => {
            const req = mockRequest({ authorization: headerValue });
            const res = mockResponse();
            next.mockClear();
            await middleware(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                error: vitest_1.expect.objectContaining({ code: shared_1.ErrorCode.UNAUTHORIZED }),
            }));
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 1.3, 9.1, 9.2**
     *
     * For "Bearer " + random token WITHOUT "ng_" prefix,
     * the middleware must return 401 UNAUTHORIZED.
     */
    (0, vitest_1.it)('rejects Bearer tokens without ng_ prefix', async () => {
        const keyStore = rejectingKeyStore();
        const middleware = (0, auth_1.createAuthMiddleware)(keyStore);
        const next = vitest_1.vi.fn();
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.string({ minLength: 1 }).filter((s) => !s.startsWith('ng_')), async (token) => {
            const req = mockRequest({ authorization: `Bearer ${token}` });
            const res = mockResponse();
            next.mockClear();
            await middleware(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                error: vitest_1.expect.objectContaining({ code: shared_1.ErrorCode.UNAUTHORIZED }),
            }));
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 1.3, 9.1, 9.2**
     *
     * For "Bearer ng_" + random valid-looking keys where keyStore returns null,
     * the middleware must return 401 UNAUTHORIZED.
     */
    (0, vitest_1.it)('rejects ng_ prefixed keys not found in key store', async () => {
        const keyStore = rejectingKeyStore();
        const middleware = (0, auth_1.createAuthMiddleware)(keyStore);
        const next = vitest_1.vi.fn();
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.string({ minLength: 1, maxLength: 64 }).map((s) => `ng_${s}`), async (token) => {
            const req = mockRequest({ authorization: `Bearer ${token}` });
            const res = mockResponse();
            next.mockClear();
            await middleware(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                error: vitest_1.expect.objectContaining({ code: shared_1.ErrorCode.UNAUTHORIZED }),
            }));
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 1.3, 9.1, 9.2**
     *
     * For missing/empty authorization headers,
     * the middleware must return 401 UNAUTHORIZED.
     */
    (0, vitest_1.it)('rejects requests with missing or empty authorization header', async () => {
        const keyStore = rejectingKeyStore();
        const middleware = (0, auth_1.createAuthMiddleware)(keyStore);
        const next = vitest_1.vi.fn();
        await fast_check_1.default.assert(fast_check_1.default.asyncProperty(fast_check_1.default.constantFrom(undefined, '', '   '), async (headerValue) => {
            const headers = {};
            if (headerValue !== undefined) {
                headers.authorization = headerValue;
            }
            const req = mockRequest(headers);
            const res = mockResponse();
            next.mockClear();
            await middleware(req, res, next);
            (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
            (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                error: vitest_1.expect.objectContaining({ code: shared_1.ErrorCode.UNAUTHORIZED }),
            }));
            (0, vitest_1.expect)(next).not.toHaveBeenCalled();
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=auth.property.test.js.map