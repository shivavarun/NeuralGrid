/**
 * Shared constants for NeuralGrid services.
 */

import type { Tier, Quantization } from "./types";

// --- Tier VRAM thresholds (in GB) ---

export interface TierThreshold {
  tier: Tier;
  min_gb: number;
  max_gb: number;
}

export const TIER_THRESHOLDS: TierThreshold[] = [
  { tier: "T1", min_gb: 0, max_gb: 12 },
  { tier: "T2", min_gb: 12, max_gb: 28 },
  { tier: "T3", min_gb: 28, max_gb: Infinity },
];

/** Get tier for a given VRAM value in GB */
export function getTierForVram(vram_gb: number): Tier {
  if (vram_gb <= 12) return "T1";
  if (vram_gb <= 28) return "T2";
  return "T3";
}

/** Promote tier one level up (for LOW confidence) */
export function promoteTier(tier: Tier): Tier {
  if (tier === "T1") return "T2";
  if (tier === "T2") return "T3";
  return "T3";
}

// --- Bytes per parameter by quantization ---

export const BYTES_PER_PARAM: Record<Quantization, number> = {
  fp32: 4,
  fp16: 2,
  int8: 1,
  int4: 0.5,
};

// --- Valid quantization values ---

export const QUANTIZATION_VALUES: Quantization[] = ["fp32", "fp16", "int8", "int4"];

// --- VRAM calculation constants ---

/** Overhead multiplier applied to base VRAM calculation */
export const VRAM_OVERHEAD_MULTIPLIER = 1.2;

/** Memory per token factor (GB per token) */
export const TOKEN_MEMORY_FACTOR = 0.000002 * 1024; // ~0.002048 GB per token

// --- Cache and polling constants ---

export const PRICE_CACHE_TTL_SECONDS = 90;
export const PRICE_POLL_INTERVAL_SECONDS = 60;
export const PROVIDER_FAILURE_TTL_SECONDS = 300;
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const JOB_STATUS_TTL_SECONDS = 3600;

// --- Job retry constants ---

export const MAX_JOB_RETRIES = 2;
export const CIRCUIT_BREAKER_THRESHOLD = 3;
export const CIRCUIT_BREAKER_DURATION_SECONDS = 300;
/** Rolling window over which dispatch failures are counted toward opening a breaker. */
export const CIRCUIT_BREAKER_WINDOW_SECONDS = 60;

// --- Worker pool ---

export const DEFAULT_WORKER_POOL_SIZE = 10;

// --- Price staleness (Req 21.4, 21.5) ---

/** Cached prices at or beyond this age (seconds) are stale and excluded from serving. */
export const PRICE_MAX_STALENESS_SECONDS = PRICE_CACHE_TTL_SECONDS; // 90

// --- SLO targets (Req 21.1, 21.2, 21.3) ---

/** API_Gateway target availability: proportion of non-5xx responses per UTC month. */
export const SLO_AVAILABILITY_TARGET = 0.995;
/** Job_Scheduler target P50 dispatch latency (submission → dispatch), milliseconds. */
export const SLO_P50_DISPATCH_LATENCY_MS = 800;
/** Job_Scheduler target job success rate (COMPLETE / terminal outcomes). */
export const SLO_JOB_SUCCESS_RATE_TARGET = 0.9;
