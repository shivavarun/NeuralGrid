import { describe, it, expect } from "vitest";
import { selectNodeWithFailover } from "./failover";
import type { ProviderNode } from "@neuralgrid/shared";

function makeNode(
  provider: "vastai" | "runpod",
  rate: number,
  availability: boolean
): ProviderNode {
  return {
    provider,
    node_id: `${provider}-${rate}`,
    gpu_model: "RTX 4090",
    vram_gb: 24,
    hourly_rate_usd: rate,
    availability,
  };
}

describe("selectNodeWithFailover", () => {
  it("selects cheapest available node when nodes exist", () => {
    const nodes = [
      makeNode("vastai", 0.5, true),
      makeNode("runpod", 0.3, true),
      makeNode("vastai", 0.7, true),
    ];

    const result = selectNodeWithFailover(nodes);
    expect(result).toEqual({ node: nodes[1] });
  });

  it("skips unavailable nodes", () => {
    const nodes = [
      makeNode("vastai", 0.1, false),
      makeNode("runpod", 0.5, true),
    ];

    const result = selectNodeWithFailover(nodes);
    expect(result).toEqual({ node: nodes[1] });
  });

  it("fails over to different provider when primary unavailable", () => {
    const nodes = [
      makeNode("vastai", 0.2, false), // cheapest but unavailable
      makeNode("vastai", 0.3, false), // also unavailable
      makeNode("runpod", 0.6, true), // available, different provider
    ];

    const result = selectNodeWithFailover(nodes);
    expect(result).toEqual({ node: nodes[2] });
  });

  it("returns INSUFFICIENT_CAPACITY when no nodes available", () => {
    const nodes = [
      makeNode("vastai", 0.2, false),
      makeNode("runpod", 0.3, false),
    ];

    const result = selectNodeWithFailover(nodes);
    expect(result).toEqual({ error: "INSUFFICIENT_CAPACITY" });
  });

  it("returns INSUFFICIENT_CAPACITY for empty node list", () => {
    const result = selectNodeWithFailover([]);
    expect(result).toEqual({ error: "INSUFFICIENT_CAPACITY" });
  });

  it("prefers non-deprioritized providers", () => {
    const nodes = [
      makeNode("vastai", 0.1, true), // cheapest but deprioritized
      makeNode("runpod", 0.5, true),
    ];

    const deprioritized = new Set(["vastai"]);
    const result = selectNodeWithFailover(nodes, deprioritized);
    expect(result).toEqual({ node: nodes[1] });
  });

  it("falls back to deprioritized provider when no other available", () => {
    const nodes = [
      makeNode("vastai", 0.2, true), // deprioritized but only option
      makeNode("runpod", 0.3, false), // unavailable
    ];

    const deprioritized = new Set(["vastai"]);
    const result = selectNodeWithFailover(nodes, deprioritized);
    expect(result).toEqual({ node: nodes[0] });
  });

  it("picks cheapest among non-deprioritized when multiple exist", () => {
    const nodes = [
      makeNode("vastai", 0.1, true), // deprioritized
      makeNode("runpod", 0.4, true),
      makeNode("runpod", 0.3, true), // cheapest non-deprioritized
    ];

    const deprioritized = new Set(["vastai"]);
    const result = selectNodeWithFailover(nodes, deprioritized);
    expect(result).toEqual({ node: nodes[2] });
  });
});
