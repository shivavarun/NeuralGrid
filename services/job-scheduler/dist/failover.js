"use strict";
/**
 * Provider failover logic.
 * When selected provider has no available nodes, route to different provider.
 * Requirements: 13.1, 13.2
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.selectNodeWithFailover = selectNodeWithFailover;
/**
 * Select a node with failover support.
 *
 * 1. Filter nodes by availability (availability === true)
 * 2. Separate into preferred (non-deprioritized) and deprioritized
 * 3. If preferred nodes exist, pick cheapest
 * 4. If only deprioritized nodes available, use them as fallback
 * 5. If NO available nodes at all, return INSUFFICIENT_CAPACITY
 */
function selectNodeWithFailover(allNodes, deprioritizedProviders) {
    const deprioritized = deprioritizedProviders ?? new Set();
    // Filter to available nodes only
    const available = allNodes.filter((n) => n.availability === true);
    if (available.length === 0) {
        return { error: "INSUFFICIENT_CAPACITY" };
    }
    // Split into preferred and deprioritized
    const preferred = available.filter((n) => !deprioritized.has(n.provider));
    // Use preferred if any exist, otherwise fall back to deprioritized
    const candidates = preferred.length > 0 ? preferred : available;
    // Pick cheapest
    let cheapest = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
        if (candidates[i].hourly_rate_usd < cheapest.hourly_rate_usd) {
            cheapest = candidates[i];
        }
    }
    return { node: cheapest };
}
//# sourceMappingURL=failover.js.map