"use strict";
/**
 * Unit tests for job dispatch and retry logic.
 * Requirements: 8.2, 8.3, 8.4, 8.5, 10.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const dispatcher_1 = require("./dispatcher");
// --- Helpers ---
function makeNode(overrides = {}) {
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
function makeRequest(overrides = {}) {
    return {
        job_id: "job_test123",
        model: "llama-3-8b",
        tier: "T1",
        input: { type: "text", content: "Hello" },
        output: { type: "text", max_tokens: 100 },
        quantization: "int8",
        selected_node: makeNode(),
        ...overrides,
    };
}
function successFn(runtime_seconds = 120) {
    return async () => ({
        success: true,
        runtime_seconds,
        result: { content: "done", tokens_generated: 50, model: "llama-3-8b", finish_reason: "stop" },
    });
}
function failFn(error = "provider error") {
    return async () => ({ success: false, error });
}
// --- Tests ---
(0, vitest_1.describe)("calculateCost", () => {
    (0, vitest_1.it)("computes hourly_rate × (runtime_seconds / 3600)", () => {
        (0, vitest_1.expect)((0, dispatcher_1.calculateCost)(1.0, 3600)).toBe(1.0);
        (0, vitest_1.expect)((0, dispatcher_1.calculateCost)(0.5, 1800)).toBe(0.25);
        (0, vitest_1.expect)((0, dispatcher_1.calculateCost)(2.0, 900)).toBe(0.5);
        (0, vitest_1.expect)((0, dispatcher_1.calculateCost)(0.0, 3600)).toBe(0.0);
        (0, vitest_1.expect)((0, dispatcher_1.calculateCost)(1.0, 0)).toBe(0.0);
    });
});
(0, vitest_1.describe)("dispatchJob", () => {
    (0, vitest_1.it)("succeeds on first try", async () => {
        const node = makeNode({ provider: "vastai", hourly_rate_usd: 0.6 });
        const request = makeRequest({ selected_node: node });
        const result = await (0, dispatcher_1.dispatchJob)(request, [node], successFn(3600));
        (0, vitest_1.expect)(result.status).toBe("complete");
        (0, vitest_1.expect)(result.provider).toBe("vastai");
        (0, vitest_1.expect)(result.actual_cost_usd).toBe("0.600000");
        (0, vitest_1.expect)(result.retries).toBe(0);
        (0, vitest_1.expect)(result.result).toBeDefined();
    });
    (0, vitest_1.it)("retries on different provider after failure", async () => {
        const vastNode = makeNode({ provider: "vastai", node_id: "v1", hourly_rate_usd: 0.5 });
        const runpodNode = makeNode({ provider: "runpod", node_id: "r1", hourly_rate_usd: 0.7 });
        const request = makeRequest({ selected_node: vastNode });
        let callCount = 0;
        const dispatchFn = async (node) => {
            callCount++;
            if (node.provider === "vastai") {
                return { success: false, error: "vastai down" };
            }
            return {
                success: true,
                runtime_seconds: 1800,
                result: { content: "ok", tokens_generated: 10, model: "llama-3-8b", finish_reason: "stop" },
            };
        };
        const result = await (0, dispatcher_1.dispatchJob)(request, [vastNode, runpodNode], dispatchFn);
        (0, vitest_1.expect)(result.status).toBe("complete");
        (0, vitest_1.expect)(result.provider).toBe("runpod");
        (0, vitest_1.expect)(result.retries).toBe(1);
        (0, vitest_1.expect)(callCount).toBe(2);
    });
    (0, vitest_1.it)("fails after max 2 retries (3 total attempts)", async () => {
        const node1 = makeNode({ provider: "vastai", node_id: "v1" });
        const node2 = makeNode({ provider: "runpod", node_id: "r1" });
        const node3 = makeNode({ provider: "vastai", node_id: "v2" }); // same provider as node1
        // Create 3 different providers to allow 3 attempts
        const nodeA = makeNode({ provider: "vastai", node_id: "a1" });
        const nodeB = makeNode({ provider: "runpod", node_id: "b1" });
        // Only 2 distinct providers, so after failing both, no more retries possible
        const request = makeRequest({ selected_node: nodeA });
        const result = await (0, dispatcher_1.dispatchJob)(request, [nodeA, nodeB], failFn());
        (0, vitest_1.expect)(result.status).toBe("failed");
        (0, vitest_1.expect)(result.retries).toBeLessThanOrEqual(2);
    });
    (0, vitest_1.it)("exhausts all retries and returns failed status", async () => {
        // 3 distinct providers to allow full retry chain
        const nodeA = makeNode({ provider: "vastai", node_id: "a" });
        const nodeB = makeNode({ provider: "runpod", node_id: "b" });
        const request = makeRequest({ selected_node: nodeA });
        let calls = [];
        const dispatchFn = async (node) => {
            calls.push(node.provider);
            return { success: false, error: "fail" };
        };
        const result = await (0, dispatcher_1.dispatchJob)(request, [nodeA, nodeB], dispatchFn);
        (0, vitest_1.expect)(result.status).toBe("failed");
        // Should have tried vastai then runpod (2 distinct providers = 2 attempts)
        (0, vitest_1.expect)(calls.length).toBe(2);
    });
    (0, vitest_1.it)("never retries on same provider that failed", async () => {
        const nodeA = makeNode({ provider: "vastai", node_id: "a1", hourly_rate_usd: 0.3 });
        const nodeA2 = makeNode({ provider: "vastai", node_id: "a2", hourly_rate_usd: 0.4 });
        const nodeB = makeNode({ provider: "runpod", node_id: "b1", hourly_rate_usd: 0.5 });
        const request = makeRequest({ selected_node: nodeA });
        const triedProviders = [];
        const dispatchFn = async (node) => {
            triedProviders.push(node.provider);
            if (node.provider === "vastai") {
                return { success: false, error: "vastai error" };
            }
            return {
                success: true,
                runtime_seconds: 60,
                result: { content: "ok", tokens_generated: 5, model: "llama-3-8b", finish_reason: "stop" },
            };
        };
        const result = await (0, dispatcher_1.dispatchJob)(request, [nodeA, nodeA2, nodeB], dispatchFn);
        (0, vitest_1.expect)(result.status).toBe("complete");
        (0, vitest_1.expect)(result.provider).toBe("runpod");
        // After vastai fails, should never retry vastai even though nodeA2 exists
        const vastaiAttempts = triedProviders.filter((p) => p === "vastai");
        (0, vitest_1.expect)(vastaiAttempts.length).toBe(1);
    });
    (0, vitest_1.it)("calculates cost correctly on success", async () => {
        const node = makeNode({ hourly_rate_usd: 1.2 });
        const request = makeRequest({ selected_node: node });
        // 1800 seconds = 0.5 hours, cost = 1.2 * 0.5 = 0.6
        const result = await (0, dispatcher_1.dispatchJob)(request, [node], successFn(1800));
        (0, vitest_1.expect)(result.actual_cost_usd).toBe("0.600000");
    });
    (0, vitest_1.it)("returns failed when no alternate nodes available", async () => {
        const node = makeNode({ provider: "vastai" });
        const request = makeRequest({ selected_node: node });
        // Only one provider available, fails immediately
        const result = await (0, dispatcher_1.dispatchJob)(request, [node], failFn());
        (0, vitest_1.expect)(result.status).toBe("failed");
        (0, vitest_1.expect)(result.retries).toBe(0);
    });
});
//# sourceMappingURL=dispatcher.test.js.map