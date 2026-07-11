"use strict";
/**
 * Job dispatch and retry logic.
 * Requirements: 8.2, 8.3, 8.4, 8.5, 10.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchToProvider = dispatchToProvider;
exports.calculateCost = calculateCost;
exports.dispatchJob = dispatchJob;
const shared_1 = require("@neuralgrid/shared");
const selector_1 = require("./selector");
/**
 * Default provider dispatch — makes HTTP call to provider API.
 * For MVP this is a placeholder; real implementation would use fetch/axios.
 */
async function dispatchToProvider(node, job) {
    // MVP placeholder — real implementation would POST to provider API
    const url = node.provider === "vastai"
        ? `https://api.vast.ai/v1/dispatch`
        : `https://api.runpod.io/v2/dispatch`;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                node_id: node.node_id,
                model: job.model,
                input: job.input,
                output: job.output,
                quantization: job.quantization,
            }),
        });
        if (!response.ok) {
            return { success: false, error: `Provider returned ${response.status}` };
        }
        const data = await response.json();
        return {
            success: true,
            runtime_seconds: data.runtime_seconds,
            result: data.result,
        };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { success: false, error: message };
    }
}
/**
 * Calculate actual cost in USD.
 * Formula: hourly_rate × (runtime_seconds / 3600)
 */
function calculateCost(hourly_rate_usd, runtime_seconds) {
    return hourly_rate_usd * (runtime_seconds / 3600);
}
/**
 * Dispatch a job with retry logic.
 *
 * 1. Try selected_node first
 * 2. On failure, pick different node (exclude failed providers) and retry
 * 3. Max 2 retries (3 total attempts)
 * 4. Never retry on same provider that already failed
 * 5. On success: status="complete", calculate actual_cost
 * 6. All retries exhausted: status="failed"
 */
async function dispatchJob(request, allNodes, dispatchFn = dispatchToProvider) {
    const failedProviders = new Set();
    let retries = 0;
    let currentNode = request.selected_node;
    // Initial attempt + up to MAX_JOB_RETRIES retries
    for (let attempt = 0; attempt <= shared_1.MAX_JOB_RETRIES; attempt++) {
        if (!currentNode)
            break;
        const result = await dispatchFn(currentNode, request);
        if (result.success) {
            const runtime = result.runtime_seconds ?? 0;
            const cost = calculateCost(currentNode.hourly_rate_usd, runtime);
            return {
                job_id: request.job_id,
                status: "complete",
                provider: currentNode.provider,
                actual_cost_usd: cost.toFixed(6),
                result: result.result,
                retries,
            };
        }
        // Mark provider as failed
        failedProviders.add(currentNode.provider);
        // If this was the last attempt, don't try to find another node
        if (attempt === shared_1.MAX_JOB_RETRIES)
            break;
        // Find next node excluding failed providers
        const availableNodes = allNodes.filter((n) => !failedProviders.has(n.provider) && n.availability);
        currentNode = (0, selector_1.selectCheapestNode)(availableNodes);
        // Only count as retry if we actually found a different node to try
        if (currentNode) {
            retries++;
        }
    }
    return {
        job_id: request.job_id,
        status: "failed",
        retries,
    };
}
//# sourceMappingURL=dispatcher.js.map