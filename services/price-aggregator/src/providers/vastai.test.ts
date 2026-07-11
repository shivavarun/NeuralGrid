import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryVastaiNodes, VastaiApiError } from './vastai';

describe('Vast.ai provider client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('VASTAI_API_KEY', 'test-key');
    vi.stubEnv('VASTAI_API_URL', 'https://console.vast.ai/api/v0');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('returns nodes filtered by T1 (<=12GB)', async () => {
    const mockOffers = [
      { id: 1, gpu_name: 'RTX 3060', gpu_ram: 12288, dph_total: 0.15, rented: false, num_gpus: 1 },
      { id: 2, gpu_name: 'RTX 4090', gpu_ram: 24576, dph_total: 0.50, rented: false, num_gpus: 1 },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ offers: mockOffers }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryVastaiNodes('T1');
    expect(nodes.length).toBe(1);
    expect(nodes[0].provider).toBe('vastai');
    expect(nodes[0].vram_gb).toBe(12);
    expect(nodes[0].node_id).toBe('1');
    expect(nodes[0].hourly_rate_usd).toBe(0.15);
    expect(nodes[0].availability).toBe(true);
  });

  it('returns nodes filtered by T2 (12-28GB)', async () => {
    const mockOffers = [
      { id: 1, gpu_name: 'RTX 3060', gpu_ram: 12288, dph_total: 0.15, rented: false, num_gpus: 1 },
      { id: 2, gpu_name: 'RTX 4090', gpu_ram: 24576, dph_total: 0.50, rented: false, num_gpus: 1 },
      { id: 3, gpu_name: 'A100', gpu_ram: 81920, dph_total: 2.0, rented: false, num_gpus: 1 },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ offers: mockOffers }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryVastaiNodes('T2');
    expect(nodes.length).toBe(1);
    expect(nodes[0].vram_gb).toBe(24);
    expect(nodes[0].gpu_model).toBe('RTX 4090');
  });

  it('returns nodes filtered by T3 (>28GB)', async () => {
    const mockOffers = [
      { id: 3, gpu_name: 'A100 80GB', gpu_ram: 81920, dph_total: 2.0, rented: false, num_gpus: 1 },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ offers: mockOffers }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryVastaiNodes('T3');
    expect(nodes.length).toBe(1);
    expect(nodes[0].vram_gb).toBe(80);
  });

  it('throws VastaiApiError on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    }) as any;

    await expect(queryVastaiNodes('T1')).rejects.toThrow(VastaiApiError);
    await expect(queryVastaiNodes('T1')).rejects.toThrow('HTTP 500');
  });

  it('throws VastaiApiError on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(queryVastaiNodes('T1')).rejects.toThrow(VastaiApiError);
    await expect(queryVastaiNodes('T1')).rejects.toThrow('network error');
  });

  it('marks rented nodes as unavailable', async () => {
    const mockOffers = [
      { id: 1, gpu_name: 'RTX 3060', gpu_ram: 12288, dph_total: 0.15, rented: true, num_gpus: 1 },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ offers: mockOffers }),
      text: () => Promise.resolve(''),
    }) as any;

    const nodes = await queryVastaiNodes('T1');
    expect(nodes[0].availability).toBe(false);
  });
});
