import { Request, Response, NextFunction } from 'express';
/** Prefix convention for all NeuralGrid API keys. */
export declare const API_KEY_PREFIX = "ng_";
/**
 * Database abstraction for API key lookups.
 */
export interface ApiKeyRecord {
    developer_id: string;
    key_prefix: string;
}
export interface KeyStore {
    findActiveKeyByHash(hash: string): Promise<ApiKeyRecord | null>;
}
/**
 * Extend Express Request to carry authenticated developer info.
 */
export interface AuthenticatedRequest extends Request {
    developerId?: string;
}
/**
 * Compute SHA-256 hash of an API key.
 */
export declare function hashApiKey(key: string): string;
/**
 * Create authentication middleware with injected key store.
 */
export declare function createAuthMiddleware(keyStore: KeyStore): (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
/**
 * Generate a fresh API key plaintext with the NeuralGrid prefix convention
 * (`ng_` + 32 bytes of random hex). Pure aside from the CSPRNG source.
 */
export declare function generateApiKey(prefix?: string): string;
/**
 * Mask an API key for any post-creation view: keep the first 8 and last 4
 * characters, replace everything in between with `*`. Pure function.
 *
 * For keys too short to show a non-overlapping first-8 + last-4 window
 * (length <= 12), every character is masked so no usable material leaks.
 */
export declare function maskApiKey(key: string): string;
/**
 * The persisted representation of an API key. The plaintext is NEVER stored —
 * only the SHA-256 hash (for lookup) and the masked form (for later display).
 */
export interface StoredApiKey {
    id: string;
    developer_id: string;
    key_hash: string;
    masked_key: string;
    created_at: string;
}
/**
 * Persistence abstraction for key management. `saveKey` MUST reject (throw or
 * reject its promise) if the `key_hash` cannot be durably persisted so the
 * caller can suppress the plaintext and surface a creation failure.
 */
export interface ApiKeyManagementStore {
    saveKey(record: StoredApiKey): Promise<void>;
    listKeys(developerId: string): Promise<StoredApiKey[]>;
}
/** Newly-minted key material derived from a generated plaintext (pure). */
export interface ApiKeyMaterial {
    plaintext: string;
    key_hash: string;
    masked_key: string;
}
/**
 * Derive the storable material for a plaintext key: its SHA-256 hash and its
 * masked display form. Pure function — does not persist anything.
 */
export declare function deriveApiKeyMaterial(plaintext: string): ApiKeyMaterial;
/** Result of a key-creation attempt. */
export type CreateApiKeyResult = {
    ok: true;
    /** Full plaintext — returned exactly once, in this creation result only. */
    plaintext: string;
    key: StoredApiKey;
} | {
    ok: false;
};
/**
 * Create and persist a new API key for a developer.
 *
 * Stores only `sha256(key)` and the masked form; the plaintext is returned in
 * the result exactly once and is never persisted or logged. If persistence of
 * the `key_hash` fails, the plaintext is omitted from the result and `ok` is
 * false so the caller returns a key-creation-failed error (Req 11.1, 11.5).
 */
export declare function createApiKey(store: ApiKeyManagementStore, developerId: string, now?: Date): Promise<CreateApiKeyResult>;
/**
 * The masked, safe-to-return view of a stored key (never includes plaintext).
 */
export interface MaskedApiKeyView {
    id: string;
    masked_key: string;
    created_at: string;
}
/** Project a stored key into its masked, listable view (Req 11.2, 11.3). */
export declare function toMaskedView(key: StoredApiKey): MaskedApiKeyView;
