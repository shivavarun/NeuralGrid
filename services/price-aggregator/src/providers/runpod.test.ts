import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryRunpodNodes, RunpodApiError } from './runpod';

describe('RunPod provider client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('RUNPOD_API_KEY', 'test-key');
    vi.stubEnv('RUNPOD_API_URL', 'https://api.runpod.io/graphql');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('returns nodes filtered by T1 (<=12GB)', async () => {
    const gpuTypes = [
      { id: 'gpu-1', displayName: 'RTX 3060', memoryInGb: 12, communityPrice: 0.2, securePrice: 0.3, available: true },
      { id: 'gpu-2', displayName: 'RTX 4090', memoryInGb: 24, communityPrice: 0.5, securePrice: 0.7, available: true },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { gpuTypes } }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryRunpodNodes('T1');
    expect(nodes.length).toBe(1);
    expect(nodes[0].provider).toBe('runpod');
    expect(nodes[0].node_id).toBe('gpu-1');
    expect(nodes[0].vram_gb).toBe(12);
    expect(nodes[0].hourly_rate_usd).toBe(0.2);
    expect(nodes[0].availability).toBe(true);
  });

  it('returns nodes filtered by T2 (12-28GB)', async () => {
    const gpuTypes = [
      { id: 'gpu-1', displayName: 'RTX 3060', memoryInGb: 12, communityPrice: 0.2, securePrice: 0.3, available: true },
      { id: 'gpu-2', displayName: 'RTX 4090', memoryInGb: 24, communityPrice: 0.5, securePrice: 0.7, available: true },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { gpuTypes } }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryRunpodNodes('T2');
    expect(nodes.length).toBe(1);
    expect(nodes[0].vram_gb).toBe(24);
  });

  it('returns nodes filtered by T3 (>28GB)', async () => {
    const gpuTypes = [
      { id: 'gpu-3', displayName: 'A100', memoryInGb: 80, communityPrice: 2.0, securePrice: 2.5, available: true },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { gpuTypes } }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryRunpodNodes('T3');
    expect(nodes.length).toBe(1);
    expect(nodes[0].vram_gb).toBe(80);
  });

  it('throws RunpodApiError on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    }) as any;

    await expect(queryRunpodNodes('T1')).rejects.toThrow(RunpodApiError);
    await expect(queryRunpodNodes('T1')).rejects.toThrow('HTTP 403');
  });

  it('throws RunpodApiError on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(queryRunpodNodes('T1')).rejects.toThrow(RunpodApiError);
    await expect(queryRunpodNodes('T1')).rejects.toThrow('network error');
  });

  it('throws RunpodApiError on GraphQL error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ errors: [{ message: 'Unauthorized' }] }),
      text: () => Promise.resolve(''),
    }) as any;

    await expect(queryRunpodNodes('T1')).rejects.toThrow(RunpodApiError);
    await expect(queryRunpodNodes('T1')).rejects.toThrow('GraphQL error');
  });

  it('falls back to securePrice when communityPrice is null', async () => {
    const gpuTypes = [
      { id: 'gpu-1', displayName: 'A6000', memoryInGb: 48, communityPrice: null, securePrice: 0.8, available: true },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { gpuTypes } }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryRunpodNodes('T3');
    expect(nodes[0].hourly_rate_usd).toBe(0.8);
  });
});
