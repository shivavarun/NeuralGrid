/**
 * Provider failover logic.
 * When selected provider has no available nodes, route to different provider.
 * Requirements: 13.1, 13.2
 */
import type { ProviderNode } from "@neuralgrid/shared";
export type FailoverResult = {
    node: ProviderNode;
} | {
    error: "INSUFFICIENT_CAPACITY";
};
/**
 * Select a node with failover support.
 *
 * 1. Filter nodes by availability (availability === true)
 * 2. Separate into preferred (non-deprioritized) and deprioritized
 * 3. If preferred nodes exist, pick cheapest
 * 4. If only deprioritized nodes available, use them as fallback
 * 5. If NO available nodes at all, return INSUFFICIENT_CAPACITY
 */
export declare function selectNodeWithFailover(allNodes: ProviderNode[], deprioritizedProviders?: Set<string>): FailoverResult;
