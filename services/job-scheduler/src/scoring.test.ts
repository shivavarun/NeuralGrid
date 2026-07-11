/**
 * Unit tests for the node scoring module (Req 22.2).
 *
 * Covers: lowest-score selection when prices differ, identical-score ties,
 * the AMD scoring bonus tipping selection, breaker-deprioritized penalty and
 * fallback, and score-computation edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  computeNodeScore,
  selectLowestScoreNode,
  isAmdNode,
  AMD_SCORE_BONUS_PCT,
  BREAKER_OPEN_PENALTY,
  type ScorableNode,
} from "./scoring";

function makeNode(overrides: Partial<ScorableNode> = {}): ScorableNode {
  return {
    provider: "vastai",
    node_id: "node-1",
    gpu_model: "RTX 4090",
    vram_gb: 24,
    hourly_rate_usd: 0.5,
    availability: true,
    ...overrides,
  };
}

describe("computeNodeScore", () => {
  it("scores a plain node at its hourly rate", () => {
    expect(computeNodeScore(makeNode({ hourly_rate_usd: 0.8 }))).toBeCloseTo(0.8, 6);
  });

  it("applies the AMD bonus as a score reduction", () => {
    const node = makeNode({ hourly_rate_usd: 1.0, hardware_vendor: "AMD" });
    const expected = 1.0 - (1.0 * AMD_SCORE_BONUS_PCT) / 100;
    expect(computeNodeScore(node)).toBeCloseTo(expected, 6);
    expect(computeNodeScore(node)).toBeLessThan(1.0);
  });

  it("does not apply the AMD bonus to NVIDIA or unknown vendors", () => {
    expect(computeNodeScore(makeNode({ hourly_rate_usd: 1.0, hardware_vendor: "NVIDIA" }))).toBeCloseTo(1.0, 6);
    expect(computeNodeScore(makeNode({ hourly_rate_usd: 1.0, hardware_vendor: "unknown" }))).toBeCloseTo(1.0, 6);
    expect(computeNodeScore(makeNode({ hourly_rate_usd: 1.0 }))).toBeCloseTo(1.0, 6);
  });

  it("adds the breaker penalty for deprioritized providers", () => {
    const node = makeNode({ provider: "runpod", hourly_rate_usd: 0.5 });
    const score = computeNodeScore(node, {
      deprioritizedProviders: new Set(["runpod"]),
    });
    expect(score).toBeCloseTo(0.5 + BREAKER_OPEN_PENALTY, 6);
  });
});

describe("isAmdNode", () => {
  it("is true only for AMD vendor", () => {
    expect(isAmdNode(makeNode({ hardware_vendor: "AMD" }))).toBe(true);
    expect(isAmdNode(makeNode({ hardware_vendor: "NVIDIA" }))).toBe(false);
    expect(isAmdNode(makeNode())).toBe(false);
  });
});

describe("selectLowestScoreNode", () => {
  it("returns null for an empty list", () => {
    expect(selectLowestScoreNode([])).toBeNull();
  });

  it("returns the only node for a single-element list", () => {
    const node = makeNode();
    expect(selectLowestScoreNode([node])).toBe(node);
  });

  it("selects the lowest-price node when prices differ", () => {
    const cheap = makeNode({ node_id: "cheap", hourly_rate_usd: 0.2 });
    const mid = makeNode({ node_id: "mid", hourly_rate_usd: 0.5 });
    const pricey = makeNode({ node_id: "pricey", hourly_rate_usd: 1.0 });
    expect(selectLowestScoreNode([pricey, mid, cheap])).toBe(cheap);
  });

  it("breaks identical-score ties by first-encountered", () => {
    const a = makeNode({ node_id: "a", hourly_rate_usd: 0.3 });
    const b = makeNode({ node_id: "b", hourly_rate_usd: 0.3 });
    expect(selectLowestScoreNode([a, b])).toBe(a);
    // Order reversed -> the other identically-scored node wins.
    expect(selectLowestScoreNode([b, a])).toBe(b);
  });

  it("prefers an AMD node when the bonus makes its score lowest", () => {
    // NVIDIA at 0.50 vs AMD at 0.53. Raw price favors NVIDIA, but AMD's 10%
    // bonus => 0.53 * 0.9 = 0.477 < 0.50, so AMD wins.
    const nvidia = makeNode({ node_id: "nv", hourly_rate_usd: 0.5, hardware_vendor: "NVIDIA" });
    const amd = makeNode({ node_id: "amd", hourly_rate_usd: 0.53, hardware_vendor: "AMD" });
    expect(selectLowestScoreNode([nvidia, amd])).toBe(amd);
  });

  it("does not let the AMD bonus win when the price gap is too large", () => {
    const nvidia = makeNode({ node_id: "nv", hourly_rate_usd: 0.4, hardware_vendor: "NVIDIA" });
    const amd = makeNode({ node_id: "amd", hourly_rate_usd: 0.6, hardware_vendor: "AMD" });
    // AMD effective = 0.54 > 0.40, NVIDIA still wins.
    expect(selectLowestScoreNode([nvidia, amd])).toBe(nvidia);
  });

  it("excludes deprioritized providers in favor of healthy ones", () => {
    const openProvider = makeNode({ provider: "vastai", node_id: "open", hourly_rate_usd: 0.1 });
    const healthy = makeNode({ provider: "runpod", node_id: "healthy", hourly_rate_usd: 0.3 });
    const result = selectLowestScoreNode([openProvider, healthy], {
      deprioritizedProviders: new Set(["vastai"]),
    });
    expect(result).toBe(healthy);
  });

  it("falls back to the cheapest node when every provider is deprioritized", () => {
    const a = makeNode({ provider: "vastai", node_id: "a", hourly_rate_usd: 0.1 });
    const b = makeNode({ provider: "runpod", node_id: "b", hourly_rate_usd: 0.3 });
    const result = selectLowestScoreNode([a, b], {
      deprioritizedProviders: new Set(["vastai", "runpod"]),
    });
    expect(result).toBe(a);
  });
});
