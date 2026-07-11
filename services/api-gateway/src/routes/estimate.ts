/**
 * Cost estimate endpoint — GET /v1/models/:model_id/estimate
 * Calls Compute_Estimator, adds RunPod A100 comparison with savings percentage.
 */

import { Router, Request, Response } from 'express';
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  createErrorResponse,
} from '@neuralgrid/shared';
import type { EstimateResponse } from '@neuralgrid/shared';

// RunPod A100 80GB hourly rate (standard pricing)
export const RUNPOD_A100_RATE_PER_HOUR = 3.09;

// --- Config ---

const COMPUTE_ESTIMATOR_URL = process.env.COMPUTE_ESTIMATOR_URL || 'http://localhost:8001';

// --- HTTP client abstraction (for testing) ---

export interface HttpClient {
  post(url: string, body: unknown): Promise<{ status: number; data: unknown }>;
}

export const defaultHttpClient: HttpClient = {
  async post(url: string, body: unknown) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return { status: resp.status, data };
  },
};

// --- Response interfaces ---

export interface VsRunpodA100 {
  runpod_cost_usd: string;
  saving_pct: number;
}

export interface EstimateEndpointResponse {
  tier: string;
  min_vram_gb: number;
  estimated_runtime_seconds: number;
  estimated_cost_usd: string;
  confidence: string;
  vs_runpod_a100: VsRunpodA100;
}

// --- Router factory ---

export interface EstimateRouterDeps {
  httpClient?: HttpClient;
}

export function createEstimateRouter(deps: EstimateRouterDeps = {}): Router {
  const http = deps.httpClient || defaultHttpClient;
  const router = Router();

  router.get('/v1/models/:model_id/estimate', async (req: Request, res: Response): Promise<void> => {
    try {
      const modelId = req.params.model_id;
      const inputTokens = parseInt(req.query.input_tokens as string) || 1000;
      const maxTokens = parseInt(req.query.max_tokens as string) || 500;
      const quantization = req.query.quantization as string | undefined;

      // Call Compute_Estimator
      const estimateResp = await http.post(`${COMPUTE_ESTIMATOR_URL}/internal/estimate`, {
        model: modelId,
        quantization,
        input_tokens: inputTokens,
        max_tokens: maxTokens,
      });

      if (estimateResp.status !== 200) {
        const errData = estimateResp.data as any;
        const code = errData?.error?.code || ErrorCode.INTERNAL_ERROR;
        const message = errData?.error?.message || 'Failed to get estimate';
        const httpStatus = ERROR_HTTP_STATUS[code as ErrorCode] || 500;
        res.status(httpStatus).json(createErrorResponse(code as ErrorCode, message));
        return;
      }

      const estimate = estimateResp.data as EstimateResponse;

      // Calculate RunPod A100 equivalent cost
      const runtimeSeconds = estimate.estimated_runtime_seconds;
      const runtimeHours = runtimeSeconds / 3600;
      const runpodCost = RUNPOD_A100_RATE_PER_HOUR * runtimeHours;
      const estimatedCost = parseFloat(estimate.estimated_cost_usd);

      // savings = (runpod_cost - estimated_cost) / runpod_cost × 100
      let savingPct = 0;
      if (runpodCost > 0) {
        savingPct = ((runpodCost - estimatedCost) / runpodCost) * 100;
      }

      const response: EstimateEndpointResponse = {
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
    } catch (err) {
      res.status(500).json(
        createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Internal server error')
      );
    }
  });

  return router;
}
