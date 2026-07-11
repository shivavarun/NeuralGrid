/**
 * API key management endpoints.
 *  - POST /v1/keys   → create a key; returns full plaintext exactly once (Req 11.2)
 *  - GET  /v1/keys   → list keys, masked first-8 + last-4 only (Req 11.3)
 *
 * Plaintext keys are never persisted (only sha256 + masked form) and never
 * logged (Req 11.1, 11.4). A persist failure yields a key-creation-failed
 * error with no plaintext in the response (Req 11.5).
 */
import { Router } from 'express';
import { ApiKeyManagementStore, StoredApiKey } from '../middleware/auth';
/** In-memory management store (MVP). Persists only hash + masked form. */
export declare function createInMemoryKeyManagementStore(): ApiKeyManagementStore & {
    keys: Map<string, StoredApiKey>;
};
export interface KeysRouterDeps {
    store?: ApiKeyManagementStore;
}
export declare function createKeysRouter(deps?: KeysRouterDeps): Router;
