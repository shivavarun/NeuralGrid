import { describe, it, expect } from "vitest";
import { selectCheapestNode } from "./selector";
import type { ProviderNode } from "@neuralgrid/shared";

function makeNode(overrides: Partial<ProviderNode> = {}): ProviderNode {
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

describe("selectCheapestNode", () => {
  it("returns null for empty list", () => {
    expect(selectCheapestNode([])).toBeNull();
  });

  it("returns single node", () => {
    const node = makeNode();
    expect(selectCheapestNode([node])).toBe(node);
  });

  it("picks cheapest from multiple nodes", () => {
    const cheap = makeNode({ node_id: "cheap", hourly_rate_usd: 0.2 });
    const mid = makeNode({ node_id: "mid", hourly_rate_usd: 0.5 });
    const expensive = makeNode({ node_id: "exp", hourly_rate_usd: 1.0 });

    expect(selectCheapestNode([expensive, mid, cheap])).toBe(cheap);
  });

  it("filters out deprioritized providers", () => {
    const vastNode = makeNode({ provider: "vastai", hourly_rate_usd: 0.1 });
    const runpodNode = makeNode({ provider: "runpod", hourly_rate_usd: 0.3 });

    const deprioritized = new Set(["vastai"]);
    const result = selectCheapestNode([vastNode, runpodNode], deprioritized);

    expect(result).toBe(runpodNode);
  });

  it("falls back to deprioritized nodes when all are deprioritized", () => {
    const vastNode = makeNode({ provider: "vastai", hourly_rate_usd: 0.1 });
    const runpodNode = makeNode({ provider: "runpod", hourly_rate_usd: 0.3 });

    const deprioritized = new Set(["vastai", "runpod"]);
    const result = selectCheapestNode([vastNode, runpodNode], deprioritized);

    // Falls back to cheapest overall
    expect(result).toBe(vastNode);
  });

  it("handles tie-breaking by first found", () => {
    const a = makeNode({ node_id: "a", hourly_rate_usd: 0.2 });
    const b = makeNode({ node_id: "b", hourly_rate_usd: 0.2 });

    expect(selectCheapestNode([a, b])).toBe(a);
  });

  it("works with undefined deprioritizedProviders", () => {
    const node = makeNode({ hourly_rate_usd: 0.5 });
    expect(selectCheapestNode([node], undefined)).toBe(node);
  });
});
