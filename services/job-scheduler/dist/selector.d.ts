/**
 * Cheapest node selection logic with circuit breaker deprioritization.
 * Requirements: 8.1, 13.3
 */
import type { ProviderNode } from "@neuralgrid/shared";
/**
 * Select the cheapest available node, factoring in provider deprioritization.
 *
 * 1. Filter out deprioritized providers
 * 2. Pick node with minimum hourly_rate_usd from remaining
 * 3. If all nodes deprioritized, fall back to cheapest from full list (best effort)
 * 4. Return null if input is empty
 */
export declare function selectCheapestNode(nodes: ProviderNode[], deprioritizedProviders?: Set<string>): ProviderNode | null;
