"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_KEY_PREFIX = void 0;
exports.hashApiKey = hashApiKey;
exports.createAuthMiddleware = createAuthMiddleware;
exports.generateApiKey = generateApiKey;
exports.maskApiKey = maskApiKey;
exports.deriveApiKeyMaterial = deriveApiKeyMaterial;
exports.createApiKey = createApiKey;
exports.toMaskedView = toMaskedView;
const crypto_1 = require("crypto");
const shared_1 = require("@neuralgrid/shared");
/** Prefix convention for all NeuralGrid API keys. */
exports.API_KEY_PREFIX = 'ng_';
/**
 * Compute SHA-256 hash of an API key.
 */
function hashApiKey(key) {
    return (0, crypto_1.createHash)('sha256').update(key).digest('hex');
}
/**
 * Create authentication middleware with injected key store.
 */
function createAuthMiddleware(keyStore) {
    return async (req, res, next) => {
        const authHeader = req.headers.authorization;
        // Missing header
        if (!authHeader) {
            const status = shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.UNAUTHORIZED];
            res.status(status).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.UNAUTHORIZED, 'Missing Authorization header'));
            return;
        }
        // Must be "Bearer <token>"
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            const status = shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.UNAUTHORIZED];
            res.status(status).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.UNAUTHORIZED, 'Malformed Authorization header, expected: Bearer <token>'));
            return;
        }
        const token = parts[1];
        // Validate ng_ prefix
        if (!token.startsWith('ng_')) {
            const status = shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.UNAUTHORIZED];
            res.status(status).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.UNAUTHORIZED, 'Invalid API key format, must start with "ng_"'));
            return;
        }
        // Hash and lookup
        const keyHash = hashApiKey(token);
        const record = await keyStore.findActiveKeyByHash(keyHash);
        if (!record) {
            const status = shared_1.ERROR_HTTP_STATUS[shared_1.ErrorCode.UNAUTHORIZED];
            res.status(status).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.UNAUTHORIZED, 'Invalid or revoked API key'));
            return;
        }
        // Attach developer_id and continue
        req.developerId = record.developer_id;
        next();
    };
}
// ---------------------------------------------------------------------------
// API key creation, hashing, and masked display (Req 11.1–11.5)
// ---------------------------------------------------------------------------
/**
 * Generate a fresh API key plaintext with the NeuralGrid prefix convention
 * (`ng_` + 32 bytes of random hex). Pure aside from the CSPRNG source.
 */
function generateApiKey(prefix = exports.API_KEY_PREFIX) {
    return `${prefix}${(0, crypto_1.randomBytes)(32).toString('hex')}`;
}
/**
 * Mask an API key for any post-creation view: keep the first 8 and last 4
 * characters, replace everything in between with `*`. Pure function.
 *
 * For keys too short to show a non-overlapping first-8 + last-4 window
 * (length <= 12), every character is masked so no usable material leaks.
 */
function maskApiKey(key) {
    if (key.length <= 12) {
        return '*'.repeat(key.length);
    }
    const first = key.slice(0, 8);
    const last = key.slice(-4);
    const maskedLen = key.length - 12;
    return `${first}${'*'.repeat(maskedLen)}${last}`;
}
/**
 * Derive the storable material for a plaintext key: its SHA-256 hash and its
 * masked display form. Pure function — does not persist anything.
 */
function deriveApiKeyMaterial(plaintext) {
    return {
        plaintext,
        key_hash: hashApiKey(plaintext),
        masked_key: maskApiKey(plaintext),
    };
}
/**
 * Create and persist a new API key for a developer.
 *
 * Stores only `sha256(key)` and the masked form; the plaintext is returned in
 * the result exactly once and is never persisted or logged. If persistence of
 * the `key_hash` fails, the plaintext is omitted from the result and `ok` is
 * false so the caller returns a key-creation-failed error (Req 11.1, 11.5).
 */
async function createApiKey(store, developerId, now = new Date()) {
    const material = deriveApiKeyMaterial(generateApiKey());
    const key = {
        id: `key_${(0, crypto_1.randomBytes)(12).toString('hex')}`,
        developer_id: developerId,
        key_hash: material.key_hash,
        masked_key: material.masked_key,
        created_at: now.toISOString(),
    };
    try {
        await store.saveKey(key);
    }
    catch (err) {
        // Persist failed: never leak the plaintext. Log only the non-sensitive
        // identifier, never the plaintext key.
        console.error(`Failed to persist API key ${key.id} for developer ${developerId}`);
        return { ok: false };
    }
    return { ok: true, plaintext: material.plaintext, key };
}
/** Project a stored key into its masked, listable view (Req 11.2, 11.3). */
function toMaskedView(key) {
    return {
        id: key.id,
        masked_key: key.masked_key,
        created_at: key.created_at,
    };
}
//# sourceMappingURL=auth.js.map