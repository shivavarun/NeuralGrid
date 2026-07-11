/**
 * Property 4: Cheapest Node Selection
 * For any non-empty set of available nodes at a tier, verify the selected node
 * has the minimum hourly_rate_usd.
 *
 * **Validates: Requirements 8.1**
 *
 * Feature: neuralgrid-mvp, Property 4: Cheapest Node Selection
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { selectCheapestNode } from "./selector";
import type { ProviderNode } from "@neuralgrid/shared";

const providerArb = fc.constantFrom<"vastai" | "runpod">("vastai", "runpod");

const providerNodeArb: fc.Arbitrary<ProviderNode> = fc.record({
  provider: providerArb,
  node_id: fc.string({ minLength: 1, maxLength: 20 }),
  gpu_model: fc.constantFrom("A100", "H100", "RTX4090", "RTX3090", "A6000"),
  vram_gb: fc.integer({ min: 4, max: 80 }),
  hourly_rate_usd: fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
  availability: fc.boolean(),
});

const nonEmptyNodesArb = fc.array(providerNodeArb, { minLength: 1, maxLength: 50 });

describe("Property 4: Cheapest Node Selection", () => {
  it("selected node has minimum hourly_rate_usd among non-deprioritized nodes", () => {
    fc.assert(
      fc.property(nonEmptyNodesArb, (nodes) => {
        const result = selectCheapestNode(nodes);

        // selectCheapestNode picks cheapest from all nodes when no deprioritization
        expect(result).not.toBeNull();

        const minRate = Math.min(...nodes.map((n) => n.hourly_rate_usd));
        expect(result!.hourly_rate_usd).toBe(minRate);
      }),
      { numRuns: 100 }
    );
  });

  it("selected node has minimum hourly_rate_usd among non-deprioritized providers", () => {
    fc.assert(
      fc.property(
        nonEmptyNodesArb,
        fc.subarray(["vastai", "runpod"] as const, { minLength: 1, maxLength: 1 }),
        (nodes, deprioritizedArr) => {
          const deprioritized = new Set<string>(deprioritizedArr);
          const result = selectCheapestNode(nodes, deprioritized);

          expect(result).not.toBeNull();

          const nonDeprioritized = nodes.filter(
            (n) => !deprioritized.has(n.provider)
          );

          if (nonDeprioritized.length > 0) {
            // Should pick cheapest from non-deprioritized
            const minRate = Math.min(
              ...nonDeprioritized.map((n) => n.hourly_rate_usd)
            );
            expect(result!.hourly_rate_usd).toBe(minRate);
          } else {
            // Fallback: all deprioritized, pick cheapest overall
            const minRate = Math.min(...nodes.map((n) => n.hourly_rate_usd));
            expect(result!.hourly_rate_usd).toBe(minRate);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when all providers deprioritized, still picks cheapest overall (fallback)", () => {
    fc.assert(
      fc.property(nonEmptyNodesArb, (nodes) => {
        // Deprioritize all providers
        const allProviders = new Set(nodes.map((n) => n.provider));
        const result = selectCheapestNode(nodes, allProviders);

        expect(result).not.toBeNull();

        const minRate = Math.min(...nodes.map((n) => n.hourly_rate_usd));
        expect(result!.hourly_rate_usd).toBe(minRate);
      }),
      { numRuns: 100 }
    );
  });
});
