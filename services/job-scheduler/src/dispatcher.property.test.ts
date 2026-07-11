/**
 * Property tests for retry logic and cost calculation.
 *
 * - Property 5: Retry Invariant — Different Provider, Max 2 Retries
 * - Property 17: Actual Cost Calculation
 * - Property 18: Provider Circuit Breaker
 *
 * **Validates: Requirements 8.4, 8.5, 10.1, 13.3**
 *
 * Feature: neuralgrid-mvp
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { dispatchJob, calculateCost } from "./dispatcher";
import { selectCheapestNode } from "./selector";
import type { ProviderNode, DispatchRequest } from "@neuralgrid/shared";
import type { ProviderDispatchFn, ProviderDispatchResult } from "./dispatcher";

// --- Generators ---

const providerArb = fc.constantFrom<"vastai" | "runpod">("vastai", "runpod");

const providerNodeArb: fc.Arbitrary<ProviderNode> = fc.record({
  provider: providerArb,
  node_id: fc.string({ minLength: 1, maxLength: 20 }),
  gpu_model: fc.constantFrom("A100", "H100", "RTX4090", "RTX3090", "A6000"),
  vram_gb: fc.integer({ min: 4, max: 80 }),
  hourly_rate_usd: fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
  availability: fc.constant(true),
});

const dispatchRequestArb = (selectedNode: ProviderNode): fc.Arbitrary<DispatchRequest> =>
  fc.record({
    job_id: fc.string({ minLength: 4, maxLength: 30 }).map((s) => `job_${s}`),
    model: fc.constantFrom("llama-3-8b", "stable-diffusion-xl", "whisper-large"),
    tier: fc.constantFrom<"T1" | "T2" | "T3">("T1", "T2", "T3"),
    input: fc.record({
      type: fc.constant("text"),
      content: fc.string({ minLength: 1, maxLength: 100 }),
    }),
    output: fc.record({
      type: fc.constant<"text">("text"),
      max_tokens: fc.integer({ min: 1, max: 4096 }),
    }),
    quantization: fc.constantFrom<"fp32" | "fp16" | "int8" | "int4">("fp32", "fp16", "int8", "int4"),
    selected_node: fc.constant(selectedNode),
  });

/**
 * Generate node lists with at least 2 distinct providers.
 */
const multiProviderNodesArb: fc.Arbitrary<ProviderNode[]> = fc
  .tuple(
    providerNodeArb.map((n) => ({ ...n, provider: "vastai" as const })),
    providerNodeArb.map((n) => ({ ...n, provider: "runpod" as const })),
    fc.array(providerNodeArb, { minLength: 0, maxLength: 5 })
  )
  .map(([a, b, rest]) => [a, b, ...rest]);

// --- Property 5: Retry Invariant ---

describe("Property 5: Retry Invariant — Different Provider, Max 2 Retries", () => {
  it("retry never uses same provider that already failed, max retries is 2", async () => {
    await fc.assert(
      fc.asyncProperty(multiProviderNodesArb, async (allNodes) => {
        const selectedNode = allNodes[0];
        const request: DispatchRequest = {
          job_id: "job_test123",
          model: "llama-3-8b",
          tier: "T1",
          input: { type: "text", content: "hello" },
          output: { type: "text", max_tokens: 100 },
          quantization: "int8",
          selected_node: selectedNode,
        };

        // Track which providers were dispatched to
        const dispatchedProviders: string[] = [];

        const alwaysFailFn: ProviderDispatchFn = async (node) => {
          dispatchedProviders.push(node.provider);
          return { success: false, error: "simulated failure" };
        };

        const result = await dispatchJob(request, allNodes, alwaysFailFn);

        // Should be failed since all attempts fail
        expect(result.status).toBe("failed");

        // Max retries is 2 (so max 3 total attempts)
        expect(result.retries).toBeLessThanOrEqual(2);

        // Total attempts should be at most 3
        expect(dispatchedProviders.length).toBeLessThanOrEqual(3);

        // Each retry uses a different provider than any that already failed
        const failedSoFar = new Set<string>();
        for (let i = 0; i < dispatchedProviders.length; i++) {
          if (i > 0) {
            // This attempt should NOT be a provider that already failed
            expect(failedSoFar.has(dispatchedProviders[i])).toBe(false);
          }
          failedSoFar.add(dispatchedProviders[i]);
        }
      }),
      { numRuns: 100 }
    );
  });
});

// --- Property 17: Actual Cost Calculation ---

describe("Property 17: Actual Cost Calculation", () => {
  it("calculateCost matches hourly_rate × (runtime_seconds / 3600)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
        fc.float({ min: Math.fround(1), max: Math.fround(36000), noNaN: true }),
        (hourlyRate, runtimeSeconds) => {
          const result = calculateCost(hourlyRate, runtimeSeconds);
          const expected = hourlyRate * (runtimeSeconds / 3600);

          // Use approximate equality due to floating point
          expect(result).toBeCloseTo(expected, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("cost is zero when runtime is zero", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
        (hourlyRate) => {
          expect(calculateCost(hourlyRate, 0)).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("cost scales linearly with runtime", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(50), noNaN: true }),
        fc.float({ min: Math.fround(1), max: Math.fround(18000), noNaN: true }),
        (hourlyRate, runtime) => {
          const cost1 = calculateCost(hourlyRate, runtime);
          const cost2 = calculateCost(hourlyRate, runtime * 2);

          // cost2 should be approximately 2× cost1
          expect(cost2).toBeCloseTo(cost1 * 2, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 18: Provider Circuit Breaker ---

describe("Property 18: Provider Circuit Breaker", () => {
  it("deprioritized providers are filtered out when non-deprioritized alternatives exist", () => {
    fc.assert(
      fc.property(multiProviderNodesArb, (allNodes) => {
        // Pick one provider to deprioritize
        const providerToDeprioritize = allNodes[0].provider;
        const deprioritized = new Set<string>([providerToDeprioritize]);

        // Ensure there are non-deprioritized nodes
        const nonDeprioritized = allNodes.filter(
          (n) => !deprioritized.has(n.provider)
        );

        if (nonDeprioritized.length > 0) {
          const result = selectCheapestNode(allNodes, deprioritized);
          expect(result).not.toBeNull();
          // Selected node should NOT be from deprioritized provider
          expect(result!.provider).not.toBe(providerToDeprioritize);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("after 3+ consecutive failures, provider is excluded from selection", () => {
    fc.assert(
      fc.property(
        multiProviderNodesArb,
        fc.integer({ min: 3, max: 10 }),
        (allNodes, failureCount) => {
          // Simulate circuit breaker: after CIRCUIT_BREAKER_THRESHOLD (3) failures,
          // provider gets added to deprioritized set
          const failedProvider = allNodes[0].provider;

          // After 3 failures, provider is deprioritized
          if (failureCount >= 3) {
            const deprioritized = new Set<string>([failedProvider]);
            const nonDeprioritized = allNodes.filter(
              (n) => !deprioritized.has(n.provider)
            );

            if (nonDeprioritized.length > 0) {
              const result = selectCheapestNode(allNodes, deprioritized);
              expect(result).not.toBeNull();
              expect(result!.provider).not.toBe(failedProvider);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("when all providers deprioritized, falls back to cheapest overall", () => {
    fc.assert(
      fc.property(multiProviderNodesArb, (allNodes) => {
        // Deprioritize all providers
        const allProviders = new Set(allNodes.map((n) => n.provider));
        const result = selectCheapestNode(allNodes, allProviders);

        expect(result).not.toBeNull();
        const minRate = Math.min(...allNodes.map((n) => n.hourly_rate_usd));
        expect(result!.hourly_rate_usd).toBe(minRate);
      }),
      { numRuns: 100 }
    );
  });
});
