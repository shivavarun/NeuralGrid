"use strict";
/**
 * API key management endpoints.
 *  - POST /v1/keys   → create a key; returns full plaintext exactly once (Req 11.2)
 *  - GET  /v1/keys   → list keys, masked first-8 + last-4 only (Req 11.3)
 *
 * Plaintext keys are never persisted (only sha256 + masked form) and never
 * logged (Req 11.1, 11.4). A persist failure yields a key-creation-failed
 * error with no plaintext in the response (Req 11.5).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryKeyManagementStore = createInMemoryKeyManagementStore;
exports.createKeysRouter = createKeysRouter;
const express_1 = require("express");
const shared_1 = require("@neuralgrid/shared");
const auth_1 = require("../middleware/auth");
/** In-memory management store (MVP). Persists only hash + masked form. */
function createInMemoryKeyManagementStore() {
    const keys = new Map();
    return {
        keys,
        async saveKey(record) {
            keys.set(record.id, record);
        },
        async listKeys(developerId) {
            return [...keys.values()].filter((k) => k.developer_id === developerId);
        },
    };
}
function createKeysRouter(deps = {}) {
    const store = deps.store || createInMemoryKeyManagementStore();
    const router = (0, express_1.Router)();
    // Create a new API key.
    router.post('/v1/keys', async (req, res) => {
        try {
            const developerId = req.developerId;
            if (!developerId) {
                res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.UNAUTHORIZED]).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.UNAUTHORIZED, 'Authentication required'));
                return;
            }
            const result = await (0, auth_1.createApiKey)(store, developerId);
            // Persist failure: omit plaintext, return a key-creation-failed error.
            if (!result.ok) {
                res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.INTERNAL_ERROR]).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.INTERNAL_ERROR, 'API key creation failed'));
                return;
            }
            // Success: return full plaintext exactly once, alongside the masked view.
            res.status(201).json({
                id: result.key.id,
                api_key: result.plaintext,
                masked_key: result.key.masked_key,
                created_at: result.key.created_at,
            });
        }
        catch (err) {
            res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.INTERNAL_ERROR]).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.INTERNAL_ERROR, 'Internal server error'));
        }
    });
    // List existing keys — masked only, never plaintext.
    router.get('/v1/keys', async (req, res) => {
        try {
            const developerId = req.developerId;
            if (!developerId) {
                res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.UNAUTHORIZED]).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.UNAUTHORIZED, 'Authentication required'));
                return;
            }
            const keys = await store.listKeys(developerId);
            res.status(200).json({ keys: keys.map(auth_1.toMaskedView) });
        }
        catch (err) {
            res.status(shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.INTERNAL_ERROR]).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.INTERNAL_ERROR, 'Internal server error'));
        }
    });
    return router;
}
//# sourceMappingURL=keys.js.map