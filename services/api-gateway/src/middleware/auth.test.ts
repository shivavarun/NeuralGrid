import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { createAuthMiddleware, hashApiKey, KeyStore, AuthenticatedRequest } from './auth';
import { ErrorCode } from '@neuralgrid/shared';

function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

function mockRequest(headers: Record<string, string> = {}): AuthenticatedRequest {
  return { headers } as AuthenticatedRequest;
}

describe('hashApiKey', () => {
  it('produces consistent SHA-256 hex', () => {
    const hash = hashApiKey('ng_testkey123');
    expect(hash).toHaveLength(64);
    // Same input → same output
    expect(hashApiKey('ng_testkey123')).toBe(hash);
  });

  it('different keys produce different hashes', () => {
    expect(hashApiKey('ng_key1')).not.toBe(hashApiKey('ng_key2'));
  });
});

describe('createAuthMiddleware', () => {
  let keyStore: KeyStore;
  let middleware: ReturnType<typeof createAuthMiddleware>;
  const next = vi.fn();

  beforeEach(() => {
    keyStore = {
      findActiveKeyByHash: vi.fn().mockResolvedValue(null),
    };
    middleware = createAuthMiddleware(keyStore);
    next.mockClear();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = mockRequest({});
    const res = mockResponse();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: ErrorCode.UNAUTHORIZED }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header is not Bearer format', async () => {
    const req = mockRequest({ authorization: 'Basic ng_abc123' });
    const res = mockResponse();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token lacks ng_ prefix', async () => {
    const req = mockRequest({ authorization: 'Bearer sk_abc123' });
    const res = mockResponse();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('ng_'),
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when key not found in database', async () => {
    const req = mockRequest({ authorization: 'Bearer ng_invalidkey' });
    const res = mockResponse();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(keyStore.findActiveKeyByHash).toHaveBeenCalledWith(hashApiKey('ng_invalidkey'));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next and attaches developerId for valid key', async () => {
    const validKey = 'ng_validkey12345';
    const record = { developer_id: 'dev-uuid-123', key_prefix: 'ng_valid' };
    (keyStore.findActiveKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(record);

    const req = mockRequest({ authorization: `Bearer ${validKey}` });
    const res = mockResponse();

    await middleware(req, res, next);

    expect(keyStore.findActiveKeyByHash).toHaveBeenCalledWith(hashApiKey(validKey));
    expect(req.developerId).toBe('dev-uuid-123');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 for empty Bearer token', async () => {
    const req = mockRequest({ authorization: 'Bearer ' });
    const res = mockResponse();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
