/**
 * API key management endpoints.
 *  - POST /v1/keys   → create a key; returns full plaintext exactly once (Req 11.2)
 *  - GET  /v1/keys   → list keys, masked first-8 + last-4 only (Req 11.3)
 *
 * Plaintext keys are never persisted (only sha256 + masked form) and never
 * logged (Req 11.1, 11.4). A persist failure yields a key-creation-failed
 * error with no plaintext in the response (Req 11.5).
 */

import { Router, Request, Response } from 'express';
import { ErrorCode, ERROR_HTTP_STATUS, createErrorResponse } from '@neuralgrid/shared';
import {
  ApiKeyManagementStore,
  StoredApiKey,
  createApiKey,
  toMaskedView,
} from '../middleware/auth';

/** In-memory management store (MVP). Persists only hash + masked form. */
export function createInMemoryKeyManagementStore(): ApiKeyManagementStore & {
  keys: Map<string, StoredApiKey>;
} {
  const keys = new Map<string, StoredApiKey>();
  return {
    keys,
    async saveKey(record: StoredApiKey): Promise<void> {
      keys.set(record.id, record);
    },
    async listKeys(developerId: string): Promise<StoredApiKey[]> {
      return [...keys.values()].filter((k) => k.developer_id === developerId);
    },
  };
}

export interface KeysRouterDeps {
  store?: ApiKeyManagementStore;
}

export function createKeysRouter(deps: KeysRouterDeps = {}): Router {
  const store = deps.store || createInMemoryKeyManagementStore();
  const router = Router();

  // Create a new API key.
  router.post('/v1/keys', async (req: Request, res: Response): Promise<void> => {
    try {
      const developerId = (req as any).developerId as string | undefined;
      if (!developerId) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED]).json(
          createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required')
        );
        return;
      }

      const result = await createApiKey(store, developerId);

      // Persist failure: omit plaintext, return a key-creation-failed error.
      if (!result.ok) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.INTERNAL_ERROR]).json(
          createErrorResponse(ErrorCode.INTERNAL_ERROR, 'API key creation failed')
        );
        return;
      }

      // Success: return full plaintext exactly once, alongside the masked view.
      res.status(201).json({
        id: result.key.id,
        api_key: result.plaintext,
        masked_key: result.key.masked_key,
        created_at: result.key.created_at,
      });
    } catch (err) {
      res.status(ERROR_HTTP_STATUS[ErrorCode.INTERNAL_ERROR]).json(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error')
      );
    }
  });

  // List existing keys — masked only, never plaintext.
  router.get('/v1/keys', async (req: Request, res: Response): Promise<void> => {
    try {
      const developerId = (req as any).developerId as string | undefined;
      if (!developerId) {
        res.status(ERROR_HTTP_STATUS[ErrorCode.UNAUTHORIZED]).json(
          createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required')
        );
        return;
      }

      const keys = await store.listKeys(developerId);
      res.status(200).json({ keys: keys.map(toMaskedView) });
    } catch (err) {
      res.status(ERROR_HTTP_STATUS[ErrorCode.INTERNAL_ERROR]).json(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error')
      );
    }
  });

  return router;
}
