"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const auth_1 = require("./auth");
const shared_1 = require("@neuralgrid/shared");
function mockResponse() {
    const res = {};
    res.status = vitest_1.vi.fn().mockReturnValue(res);
    res.json = vitest_1.vi.fn().mockReturnValue(res);
    return res;
}
function mockRequest(headers = {}) {
    return { headers };
}
(0, vitest_1.describe)('hashApiKey', () => {
    (0, vitest_1.it)('produces consistent SHA-256 hex', () => {
        const hash = (0, auth_1.hashApiKey)('ng_testkey123');
        (0, vitest_1.expect)(hash).toHaveLength(64);
        // Same input → same output
        (0, vitest_1.expect)((0, auth_1.hashApiKey)('ng_testkey123')).toBe(hash);
    });
    (0, vitest_1.it)('different keys produce different hashes', () => {
        (0, vitest_1.expect)((0, auth_1.hashApiKey)('ng_key1')).not.toBe((0, auth_1.hashApiKey)('ng_key2'));
    });
});
(0, vitest_1.describe)('createAuthMiddleware', () => {
    let keyStore;
    let middleware;
    const next = vitest_1.vi.fn();
    (0, vitest_1.beforeEach)(() => {
        keyStore = {
            findActiveKeyByHash: vitest_1.vi.fn().mockResolvedValue(null),
        };
        middleware = (0, auth_1.createAuthMiddleware)(keyStore);
        next.mockClear();
    });
    (0, vitest_1.it)('returns 401 when Authorization header is missing', async () => {
        const req = mockRequest({});
        const res = mockResponse();
        await middleware(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            error: vitest_1.expect.objectContaining({ code: shared_1.ErrorCode.UNAUTHORIZED }),
        }));
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('returns 401 when header is not Bearer format', async () => {
        const req = mockRequest({ authorization: 'Basic ng_abc123' });
        const res = mockResponse();
        await middleware(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('returns 401 when token lacks ng_ prefix', async () => {
        const req = mockRequest({ authorization: 'Bearer sk_abc123' });
        const res = mockResponse();
        await middleware(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(res.json).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            error: vitest_1.expect.objectContaining({
                message: vitest_1.expect.stringContaining('ng_'),
            }),
        }));
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('returns 401 when key not found in database', async () => {
        const req = mockRequest({ authorization: 'Bearer ng_invalidkey' });
        const res = mockResponse();
        await middleware(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(keyStore.findActiveKeyByHash).toHaveBeenCalledWith((0, auth_1.hashApiKey)('ng_invalidkey'));
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('calls next and attaches developerId for valid key', async () => {
        const validKey = 'ng_validkey12345';
        const record = { developer_id: 'dev-uuid-123', key_prefix: 'ng_valid' };
        keyStore.findActiveKeyByHash.mockResolvedValue(record);
        const req = mockRequest({ authorization: `Bearer ${validKey}` });
        const res = mockResponse();
        await middleware(req, res, next);
        (0, vitest_1.expect)(keyStore.findActiveKeyByHash).toHaveBeenCalledWith((0, auth_1.hashApiKey)(validKey));
        (0, vitest_1.expect)(req.developerId).toBe('dev-uuid-123');
        (0, vitest_1.expect)(next).toHaveBeenCalled();
        (0, vitest_1.expect)(res.status).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('returns 401 for empty Bearer token', async () => {
        const req = mockRequest({ authorization: 'Bearer ' });
        const res = mockResponse();
        await middleware(req, res, next);
        (0, vitest_1.expect)(res.status).toHaveBeenCalledWith(401);
        (0, vitest_1.expect)(next).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=auth.test.js.map