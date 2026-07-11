"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const selector_1 = require("./selector");
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
(0, vitest_1.describe)("selectCheapestNode", () => {
    (0, vitest_1.it)("returns null for empty list", () => {
        (0, vitest_1.expect)((0, selector_1.selectCheapestNode)([])).toBeNull();
    });
    (0, vitest_1.it)("returns single node", () => {
        const node = makeNode();
        (0, vitest_1.expect)((0, selector_1.selectCheapestNode)([node])).toBe(node);
    });
    (0, vitest_1.it)("picks cheapest from multiple nodes", () => {
        const cheap = makeNode({ node_id: "cheap", hourly_rate_usd: 0.2 });
        const mid = makeNode({ node_id: "mid", hourly_rate_usd: 0.5 });
        const expensive = makeNode({ node_id: "exp", hourly_rate_usd: 1.0 });
        (0, vitest_1.expect)((0, selector_1.selectCheapestNode)([expensive, mid, cheap])).toBe(cheap);
    });
    (0, vitest_1.it)("filters out deprioritized providers", () => {
        const vastNode = makeNode({ provider: "vastai", hourly_rate_usd: 0.1 });
        const runpodNode = makeNode({ provider: "runpod", hourly_rate_usd: 0.3 });
        const deprioritized = new Set(["vastai"]);
        const result = (0, selector_1.selectCheapestNode)([vastNode, runpodNode], deprioritized);
        (0, vitest_1.expect)(result).toBe(runpodNode);
    });
    (0, vitest_1.it)("falls back to deprioritized nodes when all are deprioritized", () => {
        const vastNode = makeNode({ provider: "vastai", hourly_rate_usd: 0.1 });
        const runpodNode = makeNode({ provider: "runpod", hourly_rate_usd: 0.3 });
        const deprioritized = new Set(["vastai", "runpod"]);
        const result = (0, selector_1.selectCheapestNode)([vastNode, runpodNode], deprioritized);
        // Falls back to cheapest overall
        (0, vitest_1.expect)(result).toBe(vastNode);
    });
    (0, vitest_1.it)("handles tie-breaking by first found", () => {
        const a = makeNode({ node_id: "a", hourly_rate_usd: 0.2 });
        const b = makeNode({ node_id: "b", hourly_rate_usd: 0.2 });
        (0, vitest_1.expect)((0, selector_1.selectCheapestNode)([a, b])).toBe(a);
    });
    (0, vitest_1.it)("works with undefined deprioritizedProviders", () => {
        const node = makeNode({ hourly_rate_usd: 0.5 });
        (0, vitest_1.expect)((0, selector_1.selectCheapestNode)([node], undefined)).toBe(node);
    });
});
//# sourceMappingURL=selector.test.js.map