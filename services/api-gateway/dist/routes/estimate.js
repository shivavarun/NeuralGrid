"use strict";
/**
 * Cost estimate endpoint — GET /v1/models/:model_id/estimate
 * Calls Compute_Estimator, adds RunPod A100 comparison with savings percentage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultHttpClient = exports.RUNPOD_A100_RATE_PER_HOUR = void 0;
exports.createEstimateRouter = createEstimateRouter;
const express_1 = require("express");
const shared_1 = require("@neuralgrid/shared");
// RunPod A100 80GB hourly rate (standard pricing)
exports.RUNPOD_A100_RATE_PER_HOUR = 3.09;
// --- Config ---
const COMPUTE_ESTIMATOR_URL = process.env.COMPUTE_ESTIMATOR_URL || 'http://localhost:8001';
exports.defaultHttpClient = {
    async post(url, body) {
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await resp.json();
        return { status: resp.status, data };
    },
};
function createEstimateRouter(deps = {}) {
    const http = deps.httpClient || exports.defaultHttpClient;
    const router = (0, express_1.Router)();
    router.get('/v1/models/:model_id/estimate', async (req, res) => {
        try {
            const modelId = req.params.model_id;
            const inputTokens = parseInt(req.query.input_tokens) || 1000;
            const maxTokens = parseInt(req.query.max_tokens) || 500;
            const quantization = req.query.quantization;
            // Call Compute_Estimator
            const estimateResp = await http.post(`${COMPUTE_ESTIMATOR_URL}/internal/estimate`, {
                model: modelId,
                quantization,
                input_tokens: inputTokens,
                max_tokens: maxTokens,
            });
            if (estimateResp.status !== 200) {
                const errData = estimateResp.data;
                const code = errData?.error?.code || shared_1.ErrorCode.INTERNAL_ERROR;
                const message = errData?.error?.message || 'Failed to get estimate';
                const httpStatus = shared_1.ERROR_HTTP_STATUS[code] || 500;
                res.status(httpStatus).json((0, shared_1.createErrorResponse)(code, message));
                return;
            }
            const estimate = estimateResp.data;
            // Calculate RunPod A100 equivalent cost
            const runtimeSeconds = estimate.estimated_runtime_seconds;
            const runtimeHours = runtimeSeconds / 3600;
            const runpodCost = exports.RUNPOD_A100_RATE_PER_HOUR * runtimeHours;
            const estimatedCost = parseFloat(estimate.estimated_cost_usd);
            // savings = (runpod_cost - estimated_cost) / runpod_cost × 100
            let savingPct = 0;
            if (runpodCost > 0) {
                savingPct = ((runpodCost - estimatedCost) / runpodCost) * 100;
            }
            const response = {
                tier: estimate.tier,
                min_vram_gb: estimate.min_vram_gb,
                estimated_runtime_seconds: estimate.estimated_runtime_seconds,
                estimated_cost_usd: estimate.estimated_cost_usd,
                confidence: estimate.confidence,
                vs_runpod_a100: {
                    runpod_cost_usd: runpodCost.toFixed(6),
                    saving_pct: Math.round(savingPct * 100) / 100,
                },
            };
            res.status(200).json(response);
        }
        catch (err) {
            res.status(500).json((0, shared_1.createErrorResponse)(shared_1.ErrorCode.INTERNAL_ERROR, 'Internal server error'));
        }
    });
    return router;
}
//# sourceMappingURL=estimate.js.map