/**
 * Job dispatch and retry logic.
 * Requirements: 8.2, 8.3, 8.4, 8.5, 10.1
 */
import type { DispatchRequest, JobStatusResponse, JobResult, ProviderNode } from "@neuralgrid/shared";
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
export type ProviderDispatchFn = (node: ProviderNode, job: DispatchRequest) => Promise<ProviderDispatchResult>;
/**
 * Default provider dispatch — makes HTTP call to provider API.
 * For MVP this is a placeholder; real implementation would use fetch/axios.
 */
export declare function dispatchToProvider(node: ProviderNode, job: DispatchRequest): Promise<ProviderDispatchResult>;
/**
 * Calculate actual cost in USD.
 * Formula: hourly_rate × (runtime_seconds / 3600)
 */
export declare function calculateCost(hourly_rate_usd: number, runtime_seconds: number): number;
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
export declare function dispatchJob(request: DispatchRequest, allNodes: ProviderNode[], dispatchFn?: ProviderDispatchFn): Promise<JobStatusResponse>;
