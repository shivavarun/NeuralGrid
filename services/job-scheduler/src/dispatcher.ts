/**
 * Job dispatch and retry logic.
 * Requirements: 8.2, 8.3, 8.4, 8.5, 10.1
 */

import type {
  DispatchRequest,
  JobStatusResponse,
  JobResult,
  ProviderNode,
} from "@neuralgrid/shared";
import { MAX_JOB_RETRIES } from "@neuralgrid/shared";
import { selectCheapestNode } from "./selector";

/** Result returned by provider dispatch call */
export interface ProviderDispatchResult {
  success: boolean;
  runtime_seconds?: number;
  result?: JobResult;
  error?: string;
}

/**
 * Provider dispatch function type.
 * Abstracted so tests can inject mock without real HTTP calls.
 */
export type ProviderDispatchFn = (
  node: ProviderNode,
  job: DispatchRequest
) => Promise<ProviderDispatchResult>;

/**
 * Default provider dispatch — makes HTTP call to provider API.
 * For MVP this is a placeholder; real implementation would use fetch/axios.
 */
export async function dispatchToProvider(
  node: ProviderNode,
  job: DispatchRequest
): Promise<ProviderDispatchResult> {
  // MVP placeholder — real implementation would POST to provider API
  const url =
    node.provider === "vastai"
      ? `https://api.vast.ai/v1/dispatch`
      : `https://api.runpod.io/v2/dispatch`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        node_id: node.node_id,
        model: job.model,
        input: job.input,
        output: job.output,
        quantization: job.quantization,
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Provider returned ${response.status}` };
    }

    const data: any = await response.json();
    return {
      success: true,
      runtime_seconds: data.runtime_seconds,
      result: data.result,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Calculate actual cost in USD.
 * Formula: hourly_rate × (runtime_seconds / 3600)
 */
export function calculateCost(
  hourly_rate_usd: number,
  runtime_seconds: number
): number {
  return hourly_rate_usd * (runtime_seconds / 3600);
}

/**
 * Dispatch a job with retry logic.
 *
 * 1. Try selected_node first
 * 2. On failure, pick different node (exclude failed providers) and retry
 * 3. Max 2 retries (3 total attempts)
 * 4. Never retry on same provider that already failed
 * 5. On success: status="complete", calculate actual_cost
 * 6. All retries exhausted: status="failed"
 */
export async function dispatchJob(
  request: DispatchRequest,
  allNodes: ProviderNode[],
  dispatchFn: ProviderDispatchFn = dispatchToProvider
): Promise<JobStatusResponse> {
  const failedProviders = new Set<string>();
  let retries = 0;
  let currentNode: ProviderNode | null = request.selected_node;

  // Initial attempt + up to MAX_JOB_RETRIES retries
  for (let attempt = 0; attempt <= MAX_JOB_RETRIES; attempt++) {
    if (!currentNode) break;

    const result = await dispatchFn(currentNode, request);

    if (result.success) {
      const runtime = result.runtime_seconds ?? 0;
      const cost = calculateCost(currentNode.hourly_rate_usd, runtime);

      return {
        job_id: request.job_id,
        status: "complete",
        provider: currentNode.provider,
        actual_cost_usd: cost.toFixed(6),
        result: result.result,
        retries,
      };
    }

    // Mark provider as failed
    failedProviders.add(currentNode.provider);

    // If this was the last attempt, don't try to find another node
    if (attempt === MAX_JOB_RETRIES) break;

    // Find next node excluding failed providers
    const availableNodes = allNodes.filter(
      (n) => !failedProviders.has(n.provider) && n.availability
    );
    currentNode = selectCheapestNode(availableNodes);

    // Only count as retry if we actually found a different node to try
    if (currentNode) {
      retries++;
    }
  }

  return {
    job_id: request.job_id,
    status: "failed",
    retries,
  };
}
