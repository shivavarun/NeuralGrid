/**
 * Shared constants for NeuralGrid services.
 */
import type { Tier, Quantization } from "./types";
export interface TierThreshold {
    tier: Tier;
    min_gb: number;
    max_gb: number;
}
export declare const TIER_THRESHOLDS: TierThreshold[];
/** Get tier for a given VRAM value in GB */
export declare function getTierForVram(vram_gb: number): Tier;
/** Promote tier one level up (for LOW confidence) */
export declare function promoteTier(tier: Tier): Tier;
export declare const BYTES_PER_PARAM: Record<Quantization, number>;
export declare const QUANTIZATION_VALUES: Quantization[];
/** Overhead multiplier applied to base VRAM calculation */
export declare const VRAM_OVERHEAD_MULTIPLIER = 1.2;
/** Memory per token factor (GB per token) */
export declare const TOKEN_MEMORY_FACTOR: number;
export declare const PRICE_CACHE_TTL_SECONDS = 90;
export declare const PRICE_POLL_INTERVAL_SECONDS = 60;
export declare const PROVIDER_FAILURE_TTL_SECONDS = 300;
export declare const RATE_LIMIT_WINDOW_SECONDS = 60;
export declare const JOB_STATUS_TTL_SECONDS = 3600;
export declare const MAX_JOB_RETRIES = 2;
export declare const CIRCUIT_BREAKER_THRESHOLD = 3;
export declare const CIRCUIT_BREAKER_DURATION_SECONDS = 300;
/** Rolling window over which dispatch failures are counted toward opening a breaker. */
export declare const CIRCUIT_BREAKER_WINDOW_SECONDS = 60;
export declare const DEFAULT_WORKER_POOL_SIZE = 10;
/** Cached prices at or beyond this age (seconds) are stale and excluded from serving. */
export declare const PRICE_MAX_STALENESS_SECONDS = 90;
/** API_Gateway target availability: proportion of non-5xx responses per UTC month. */
export declare const SLO_AVAILABILITY_TARGET = 0.995;
/** Job_Scheduler target P50 dispatch latency (submission → dispatch), milliseconds. */
export declare const SLO_P50_DISPATCH_LATENCY_MS = 800;
/** Job_Scheduler target job success rate (COMPLETE / terminal outcomes). */
export declare const SLO_JOB_SUCCESS_RATE_TARGET = 0.9;
//# sourceMappingURL=constants.d.ts.map