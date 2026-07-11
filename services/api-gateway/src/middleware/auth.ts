import { createHash, randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ErrorCode, ERROR_HTTP_STATUS, createErrorResponse } from '@neuralgrid/shared';

/** Prefix convention for all NeuralGrid API keys. */
export const API_KEY_PREFIX = 'ng_';

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
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Create authentication middleware with injected key store.
 */
export function createAuthMiddleware(keyStore: KeyStore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    // Missing header
    if (!authHeader) {
      const status = ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED];
      res.status(status).json(
        createErrorResponse(ErrorCode.UNAUTHORIZED, 'Missing Authorization header')
      );
      return;
    }

    // Must be "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      const status = ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED];
      res.status(status).json(
        createErrorResponse(ErrorCode.UNAUTHORIZED, 'Malformed Authorization header, expected: Bearer <token>')
      );
      return;
    }

    const token = parts[1];

    // Validate ng_ prefix
    if (!token.startsWith('ng_')) {
      const status = ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED];
      res.status(status).json(
        createErrorResponse(ErrorCode.UNAUTHORIZED, 'Invalid API key format, must start with "ng_"')
      );
      return;
    }

    // Hash and lookup
    const keyHash = hashApiKey(token);
    const record = await keyStore.findActiveKeyByHash(keyHash);

    if (!record) {
      const status = ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED];
      res.status(status).json(
        createErrorResponse(ErrorCode.UNAUTHORIZED, 'Invalid or revoked API key')
      );
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
export function generateApiKey(prefix: string = API_KEY_PREFIX): string {
  return `${prefix}${randomBytes(32).toString('hex')}`;
}

/**
 * Mask an API key for any post-creation view: keep the first 8 and last 4
 * characters, replace everything in between with `*`. Pure function.
 *
 * For keys too short to show a non-overlapping first-8 + last-4 window
 * (length <= 12), every character is masked so no usable material leaks.
 */
export function maskApiKey(key: string): string {
  if (key.length <= 12) {
    return '*'.repeat(key.length);
  }
  const first = key.slice(0, 8);
  const last = key.slice(-4);
  const maskedLen = key.length - 12;
  return `${first}${'*'.repeat(maskedLen)}${last}`;
}

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
export function deriveApiKeyMaterial(plaintext: string): ApiKeyMaterial {
  return {
    plaintext,
    key_hash: hashApiKey(plaintext),
    masked_key: maskApiKey(plaintext),
  };
}

/** Result of a key-creation attempt. */
export type CreateApiKeyResult =
  | {
      ok: true;
      /** Full plaintext — returned exactly once, in this creation result only. */
      plaintext: string;
      key: StoredApiKey;
    }
  | { ok: false };

/**
 * Create and persist a new API key for a developer.
 *
 * Stores only `sha256(key)` and the masked form; the plaintext is returned in
 * the result exactly once and is never persisted or logged. If persistence of
 * the `key_hash` fails, the plaintext is omitted from the result and `ok` is
 * false so the caller returns a key-creation-failed error (Req 11.1, 11.5).
 */
export async function createApiKey(
  store: ApiKeyManagementStore,
  developerId: string,
  now: Date = new Date()
): Promise<CreateApiKeyResult> {
  const material = deriveApiKeyMaterial(generateApiKey());
  const key: StoredApiKey = {
    id: `key_${randomBytes(12).toString('hex')}`,
    developer_id: developerId,
    key_hash: material.key_hash,
    masked_key: material.masked_key,
    created_at: now.toISOString(),
  };

  try {
    await store.saveKey(key);
  } catch (err) {
    // Persist failed: never leak the plaintext. Log only the non-sensitive
    // identifier, never the plaintext key.
    console.error(
      `Failed to persist API key ${key.id} for developer ${developerId}`
    );
    return { ok: false };
  }

  return { ok: true, plaintext: material.plaintext, key };
}

/**
 * The masked, safe-to-return view of a stored key (never includes plaintext).
 */
export interface MaskedApiKeyView {
  id: string;
  masked_key: string;
  created_at: string;
}

/** Project a stored key into its masked, listable view (Req 11.2, 11.3). */
export function toMaskedView(key: StoredApiKey): MaskedApiKeyView {
  return {
    id: key.id,
    masked_key: key.masked_key,
    created_at: key.created_at,
  };
}
