/**
 * Vast.ai provider client for querying available GPU nodes.
 */

import type { ProviderNode, Tier } from '@neuralgrid/shared';
import { TIER_THRESHOLDS } from '@neuralgrid/shared';

const VASTAI_API_URL = process.env.VASTAI_API_URL || 'https://console.vast.ai/api/v0';
const VASTAI_API_KEY = process.env.VASTAI_API_KEY || '';

export class VastaiApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = 'VastaiApiError';
  }
}

interface VastaiOffer {
  id: number;
  gpu_name: string;
  gpu_ram: number; // MB
  dph_total: number; // dollars per hour
  rented: boolean;
  num_gpus: number;
}

function getVramRangeForTier(tier: Tier): { min: number; max: number } {
  const threshold = TIER_THRESHOLDS.find((t) => t.tier === tier)!;
  return { min: threshold.min_gb, max: threshold.max_gb };
}

function mapOfferToNode(offer: VastaiOffer): ProviderNode {
  return {
    provider: 'vastai',
    node_id: String(offer.id),
    gpu_model: offer.gpu_name,
    vram_gb: Math.round((offer.gpu_ram / 1024) * 100) / 100,
    hourly_rate_usd: offer.dph_total,
    availability: !offer.rented,
  };
}

/**
 * Query Vast.ai for available nodes matching a GPU tier.
 */
export async function queryVastaiNodes(tier: Tier): Promise<ProviderNode[]> {
  const { min, max } = getVramRangeForTier(tier);
  const minMb = min * 1024;
  const maxMb = max === Infinity ? 1_000_000 : max * 1024;

  const url = `${VASTAI_API_URL}/bundles?q={"gpu_ram":{"gte":${minMb},"lte":${maxMb}},"rented":{"eq":false},"order":[["dph_total","asc"]]}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${VASTAI_API_KEY}`,
      },
    });
  } catch (err: any) {
    throw new VastaiApiError(`Vast.ai network error: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new VastaiApiError(
      `Vast.ai returned HTTP ${response.status}`,
      response.status,
      body
    );
  }

  const data: any = await response.json();
  const offers: VastaiOffer[] = data.offers ?? data ?? [];

  return offers
    .map(mapOfferToNode)
    .filter((node) => {
      // Double-check VRAM fits tier after conversion
      if (tier === 'T1') return node.vram_gb <= 12;
      if (tier === 'T2') return node.vram_gb > 12 && node.vram_gb <= 28;
      return node.vram_gb > 28;
    });
}
