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
export function selectCheapestNode(
  nodes: ProviderNode[],
  deprioritizedProviders?: Set<string>
): ProviderNode | null {
  if (nodes.length === 0) return null;

  const deprioritized = deprioritizedProviders ?? new Set<string>();

  // Filter to non-deprioritized nodes
  const preferred = nodes.filter((n) => !deprioritized.has(n.provider));

  // If we have preferred nodes, pick cheapest from those
  const candidates = preferred.length > 0 ? preferred : nodes;

  let cheapest: ProviderNode = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].hourly_rate_usd < cheapest.hourly_rate_usd) {
      cheapest = candidates[i];
    }
  }

  return cheapest;
}
