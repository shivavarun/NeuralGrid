import express from "express";
import type { EstimateRequest, EstimateResponse, Tier } from "@neuralgrid/shared";
import {
  ErrorCode,
  ERROR_HTTP_STATUS,
  createErrorResponse,
} from "@neuralgrid/shared";
import { calculateEstimate } from "./estimator";

const app = express();
const PORT = process.env.PORT || 8001;

app.use(express.json());

/** Fallback hourly rates when Price_Aggregator is unavailable */
const FALLBACK_RATES: Record<Tier, number> = {
  T1: 0.5,
  T2: 1.0,
  T3: 2.5,
};

/** Tokens-per-second throughput by tier (used for runtime estimation) */
const TIER_THROUGHPUT: Record<Tier, number> = {
  T1: 100,
  T2: 150,
  T3: 200,
};

/**
 * Fetch average hourly rate from Price_Aggregator.
 * Falls back to hardcoded rates if unavailable.
 */
async function getHourlyRate(tier: Tier): Promise<number> {
  const priceAggregatorUrl =
    process.env.PRICE_AGGREGATOR_URL || "http://localhost:8003";

  try {
    const res = await fetch(`${priceAggregatorUrl}/internal/prices/${tier}`);
    if (!res.ok) {
      return FALLBACK_RATES[tier];
    }
    const data = (await res.json()) as { nodes: Array<{ hourly_rate_usd: number; availability: boolean }> };
    const nodes = data.nodes;
    const available = nodes.filter((n) => n.availability);
    if (available.length === 0) {
      return FALLBACK_RATES[tier];
    }
    const sum = available.reduce((acc, n) => acc + n.hourly_rate_usd, 0);
    return sum / available.length;
  } catch {
    return FALLBACK_RATES[tier];
  }
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "compute-estimator" });
});

// POST /internal/estimate
app.post("/internal/estimate", async (req, res) => {
  try {
    const request: EstimateRequest = req.body;

    if (!request.model) {
      const errResp = createErrorResponse(
        ErrorCode.INVALID_REQUEST,
        "Missing required field: model"
      );
      res.status(ERROR_HTTP_STATUS[ErrorCode.INVALID_REQUEST]).json(errResp);
      return;
    }

    let estimate: EstimateResponse;
    try {
      estimate = calculateEstimate(request);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const errResp = createErrorResponse(
        ErrorCode.MODEL_NOT_SUPPORTED,
        message
      );
      res.status(ERROR_HTTP_STATUS[ErrorCode.MODEL_NOT_SUPPORTED]).json(errResp);
      return;
    }

    // Calculate runtime: tokens / tier throughput
    const tokens = (request.input_tokens ?? 0) + (request.max_tokens ?? 0);
    const runtimeSeconds = tokens / TIER_THROUGHPUT[estimate.tier];

    // Calculate cost: avg_hourly_rate × (runtime / 3600)
    const hourlyRate = await getHourlyRate(estimate.tier);
    const costUsd = hourlyRate * (runtimeSeconds / 3600);

    const response: EstimateResponse = {
      ...estimate,
      estimated_runtime_seconds: Math.round(runtimeSeconds * 100) / 100,
      estimated_cost_usd: costUsd.toFixed(6),
    };

    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const errResp = createErrorResponse(ErrorCode.INTERNAL_ERROR, message);
    res.status(ERROR_HTTP_STATUS[ErrorCode.INTERNAL_ERROR]).json(errResp);
  }
});

app.listen(PORT, () => {
  console.log(`Compute Estimator listening on port ${PORT}`);
});

export default app;
