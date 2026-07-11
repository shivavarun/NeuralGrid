/**
 * RunPod provider client for querying available GPU nodes.
 */

import type { ProviderNode, Tier } from '@neuralgrid/shared';

const RUNPOD_API_URL = process.env.RUNPOD_API_URL || 'https://api.runpod.io/graphql';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';

export class RunpodApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = 'RunpodApiError';
  }
}

interface RunpodGpu {
  id: string;
  displayName: string;
  memoryInGb: number;
  communityPrice: number; // $/hr
  securePrice: number;
  available: boolean;
}

function filterByTier(vram_gb: number, tier: Tier): boolean {
  if (tier === 'T1') return vram_gb <= 12;
  if (tier === 'T2') return vram_gb > 12 && vram_gb <= 28;
  return vram_gb > 28; // T3
}

function mapGpuToNode(gpu: RunpodGpu): ProviderNode {
  return {
    provider: 'runpod',
    node_id: gpu.id,
    gpu_model: gpu.displayName,
    vram_gb: gpu.memoryInGb,
    hourly_rate_usd: gpu.communityPrice ?? gpu.securePrice,
    availability: gpu.available,
  };
}

/**
 * Query RunPod for available GPU nodes matching a tier.
 */
export async function queryRunpodNodes(tier: Tier): Promise<ProviderNode[]> {
  const query = `{
    gpuTypes {
      id
      displayName
      memoryInGb
      communityPrice
      securePrice
      available: communityCloud
    }
  }`;

  let response: Response;
  try {
    response = await fetch(RUNPOD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
      },
      body: JSON.stringify({ query }),
    });
  } catch (err: any) {
    throw new RunpodApiError(`RunPod network error: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new RunpodApiError(
      `RunPod returned HTTP ${response.status}`,
      response.status,
      body
    );
  }

  const data: any = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new RunpodApiError(
      `RunPod GraphQL error: ${data.errors[0].message}`,
      200,
      JSON.stringify(data.errors)
    );
  }

  const gpus: RunpodGpu[] = data.data?.gpuTypes ?? [];

  return gpus
    .filter((gpu) => filterByTier(gpu.memoryInGb, tier))
    .map(mapGpuToNode);
}
