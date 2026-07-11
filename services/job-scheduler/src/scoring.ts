/**
 * Node scoring module (production readiness, Req 22.2).
 *
 * The MVP `selector.ts` picks a node by raw hourly rate only. Production routing
 * scores every candidate node at a Job's assigned Tier and selects the node with
 * the LOWEST computed score. A lower score means "prefer this node".
 *
 * Score model (all pure, deterministic given inputs):
 *   base            = node.hourly_rate_usd                     (cheaper is better)
 *   AMD bonus       = base * AMD_SCORE_BONUS_PCT/100 subtracted (AMD-backed
 *                     capacity is preferred, so its effective score is lower)
 *   breaker penalty = BREAKER_OPEN_PENALTY added when the node's provider has an
 *                     open circuit breaker (deprioritized, but still a fallback)
 *
 * Selection:
 *   - Among nodes, pick the minimum score.
 *   - Ties are broken by first-encountered order (stable), matching the MVP
 *     selector's tie behavior.
 *   - Empty input -> null.
 *
 * This module is intentionally self-contained and side-effect free so it is
 * fully unit- and property-testable, and so the CI coverage gate (task 27.1)
 * can measure it in isolation.
 *
 * Requirements: 22.2 (and reuses the breaker-exclusion idea from 3.2)
 */

import type { ProviderNode } from "@neuralgrid/shared";

/** GPU hardware vendor for a node. AMD-backed nodes receive a scoring bonus. */
export type HardwareVendor = "AMD" | "NVIDIA" | "unknown";

/**
 * A node that can be scored. Extends the shared MVP `ProviderNode` with an
 * optional `hardware_vendor`; when absent the node is treated as `"unknown"`
 * (no AMD bonus), so this stays backward compatible with existing callers.
 */
export interface ScorableNode extends ProviderNode {
  hardware_vendor?: HardwareVendor;
}

/**
 * AMD scoring bonus, as a percentage of the node's base (hourly-rate) score.
 * Applied as a score REDUCTION so AMD nodes are preferred among comparable
 * candidates.
 */
export const AMD_SCORE_BONUS_PCT = 10;

/**
 * Additive penalty applied to a node whose provider's circuit breaker is open.
 * Large enough to push a deprioritized node below all healthy nodes, while
 * still allowing it to win as a last-resort fallback when everything is open.
 */
export const BREAKER_OPEN_PENALTY = 1_000_000;

export interface ScoreOptions {
  /** Provider ids whose circuit breaker is open (deprioritized). */
  deprioritizedProviders?: Set<string>;
}

/** True when a node is AMD-backed and therefore eligible for the AMD bonus. */
export function isAmdNode(node: ScorableNode): boolean {
  return node.hardware_vendor === "AMD";
}

/**
 * Compute the score for a single node. Lower is better.
 *
 * The AMD bonus and the breaker penalty are independent: an AMD node whose
 * provider breaker is open still gets its bonus, but the (much larger) penalty
 * dominates so it is only chosen as a fallback.
 */
export function computeNodeScore(
  node: ScorableNode,
  options: ScoreOptions = {}
): number {
  const base = node.hourly_rate_usd;
  const amdBonus = isAmdNode(node) ? (base * AMD_SCORE_BONUS_PCT) / 100 : 0;
  const deprioritized = options.deprioritizedProviders ?? new Set<string>();
  const penalty = deprioritized.has(node.provider) ? BREAKER_OPEN_PENALTY : 0;
  return base - amdBonus + penalty;
}

/**
 * Select the node with the lowest computed score.
 *
 * - Returns `null` for an empty list.
 * - Ties (equal scores) resolve to the first-encountered node (stable).
 * - When every provider is deprioritized, the least-penalized (still lowest
 *   score) node is returned as a best-effort fallback rather than `null`.
 */
export function selectLowestScoreNode(
  nodes: ScorableNode[],
  options: ScoreOptions = {}
): ScorableNode | null {
  if (nodes.length === 0) return null;

  let best: ScorableNode = nodes[0];
  let bestScore = computeNodeScore(best, options);

  for (let i = 1; i < nodes.length; i++) {
    const score = computeNodeScore(nodes[i], options);
    // Strictly-less keeps the first node on ties (stable selection).
    if (score < bestScore) {
      best = nodes[i];
      bestScore = score;
    }
  }

  return best;
}
