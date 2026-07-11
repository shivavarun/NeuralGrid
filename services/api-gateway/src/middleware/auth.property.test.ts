import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { Response } from 'express';
import { createAuthMiddleware, KeyStore, AuthenticatedRequest } from './auth';
import { ErrorCode } from '@neuralgrid/shared';

/**
 * Property 7: Authentication Enforcement
 * For any request with missing, malformed, or invalid Authorization header,
 * verify 401 UNAUTHORIZED response.
 *
 * Validates: Requirements 1.3, 9.1, 9.2
 */

function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockRequest(headers: Record<string, string> = {}): AuthenticatedRequest {
  return { headers } as AuthenticatedRequest;
}

function rejectingKeyStore(): KeyStore {
  return {
    findActiveKeyByHash: vi.fn().mockResolvedValue(null),
  };
}

describe('Feature: neuralgrid-mvp, Property 7: Authentication Enforcement', () => {
  /**
   * **Validates: Requirements 1.3, 9.1, 9.2**
   *
   * For any random string that does NOT start with "Bearer ",
   * the middleware must return 401 UNAUTHORIZED.
   */
  it('rejects authorization headers without Bearer prefix', async () => {
    const keyStore = rejectingKeyStore();
    const middleware = createAuthMiddleware(keyStore);
    const next = vi.fn();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => !s.startsWith('Bearer ')),
        async (headerValue) => {
          const req = mockRequest({ authorization: headerValue });
          const res = mockResponse();
          next.mockClear();

          await middleware(req, res, next);

          expect(res.status).toHaveBeenCalledWith(401);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              error: expect.objectContaining({ code: ErrorCode.UNAUTHORIZED }),
            })
          );
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3, 9.1, 9.2**
   *
   * For "Bearer " + random token WITHOUT "ng_" prefix,
   * the middleware must return 401 UNAUTHORIZED.
   */
  it('rejects Bearer tokens without ng_ prefix', async () => {
    const keyStore = rejectingKeyStore();
    const middleware = createAuthMiddleware(keyStore);
    const next = vi.fn();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }).filter((s) => !s.startsWith('ng_')),
        async (token) => {
          const req = mockRequest({ authorization: `Bearer ${token}` });
          const res = mockResponse();
          next.mockClear();

          await middleware(req, res, next);

          expect(res.status).toHaveBeenCalledWith(401);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              error: expect.objectContaining({ code: ErrorCode.UNAUTHORIZED }),
            })
          );
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3, 9.1, 9.2**
   *
   * For "Bearer ng_" + random valid-looking keys where keyStore returns null,
   * the middleware must return 401 UNAUTHORIZED.
   */
  it('rejects ng_ prefixed keys not found in key store', async () => {
    const keyStore = rejectingKeyStore();
    const middleware = createAuthMiddleware(keyStore);
    const next = vi.fn();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }).map((s) => `ng_${s}`),
        async (token) => {
          const req = mockRequest({ authorization: `Bearer ${token}` });
          const res = mockResponse();
          next.mockClear();

          await middleware(req, res, next);

          expect(res.status).toHaveBeenCalledWith(401);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              error: expect.objectContaining({ code: ErrorCode.UNAUTHORIZED }),
            })
          );
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3, 9.1, 9.2**
   *
   * For missing/empty authorization headers,
   * the middleware must return 401 UNAUTHORIZED.
   */
  it('rejects requests with missing or empty authorization header', async () => {
    const keyStore = rejectingKeyStore();
    const middleware = createAuthMiddleware(keyStore);
    const next = vi.fn();

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(undefined, '', '   '),
        async (headerValue) => {
          const headers: Record<string, string> = {};
          if (headerValue !== undefined) {
            headers.authorization = headerValue;
          }
          const req = mockRequest(headers);
          const res = mockResponse();
          next.mockClear();

          await middleware(req, res, next);

          expect(res.status).toHaveBeenCalledWith(401);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              error: expect.objectContaining({ code: ErrorCode.UNAUTHORIZED }),
            })
          );
          expect(next).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
