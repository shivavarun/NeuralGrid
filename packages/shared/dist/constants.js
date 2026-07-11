"use strict";
/**
 * Shared constants for NeuralGrid services.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SLO_JOB_SUCCESS_RATE_TARGET = exports.SLO_P50_DISPATCH_LATENCY_MS = exports.SLO_AVAILABILITY_TARGET = exports.PRICE_MAX_STALENESS_SECONDS = exports.DEFAULT_WORKER_POOL_SIZE = exports.CIRCUIT_BREAKER_WINDOW_SECONDS = exports.CIRCUIT_BREAKER_DURATION_SECONDS = exports.CIRCUIT_BREAKER_THRESHOLD = exports.MAX_JOB_RETRIES = exports.JOB_STATUS_TTL_SECONDS = exports.RATE_LIMIT_WINDOW_SECONDS = exports.PROVIDER_FAILURE_TTL_SECONDS = exports.PRICE_POLL_INTERVAL_SECONDS = exports.PRICE_CACHE_TTL_SECONDS = exports.TOKEN_MEMORY_FACTOR = exports.VRAM_OVERHEAD_MULTIPLIER = exports.QUANTIZATION_VALUES = exports.BYTES_PER_PARAM = exports.TIER_THRESHOLDS = void 0;
exports.getTierForVram = getTierForVram;
exports.promoteTier = promoteTier;
exports.TIER_THRESHOLDS = [
    { tier: "T1", min_gb: 0, max_gb: 12 },
    { tier: "T2", min_gb: 12, max_gb: 28 },
    { tier: "T3", min_gb: 28, max_gb: Infinity },
];
/** Get tier for a given VRAM value in GB */
function getTierForVram(vram_gb) {
    if (vram_gb <= 12)
        return "T1";
    if (vram_gb <= 28)
        return "T2";
    return "T3";
}
/** Promote tier one level up (for LOW confidence) */
function promoteTier(tier) {
    if (tier === "T1")
        return "T2";
    if (tier === "T2")
        return "T3";
    return "T3";
}
// --- Bytes per parameter by quantization ---
exports.BYTES_PER_PARAM = {
    fp32: 4,
    fp16: 2,
    int8: 1,
    int4: 0.5,
};
// --- Valid quantization values ---
exports.QUANTIZATION_VALUES = ["fp32", "fp16", "int8", "int4"];
// --- VRAM calculation constants ---
/** Overhead multiplier applied to base VRAM calculation */
exports.VRAM_OVERHEAD_MULTIPLIER = 1.2;
/** Memory per token factor (GB per token) */
exports.TOKEN_MEMORY_FACTOR = 0.000002 * 1024; // ~0.002048 GB per token
// --- Cache and polling constants ---
exports.PRICE_CACHE_TTL_SECONDS = 90;
exports.PRICE_POLL_INTERVAL_SECONDS = 60;
exports.PROVIDER_FAILURE_TTL_SECONDS = 300;
exports.RATE_LIMIT_WINDOW_SECONDS = 60;
exports.JOB_STATUS_TTL_SECONDS = 3600;
// --- Job retry constants ---
exports.MAX_JOB_RETRIES = 2;
exports.CIRCUIT_BREAKER_THRESHOLD = 3;
exports.CIRCUIT_BREAKER_DURATION_SECONDS = 300;
/** Rolling window over which dispatch failures are counted toward opening a breaker. */
exports.CIRCUIT_BREAKER_WINDOW_SECONDS = 60;
// --- Worker pool ---
exports.DEFAULT_WORKER_POOL_SIZE = 10;
// --- Price staleness (Req 21.4, 21.5) ---
/** Cached prices at or beyond this age (seconds) are stale and excluded from serving. */
exports.PRICE_MAX_STALENESS_SECONDS = exports.PRICE_CACHE_TTL_SECONDS; // 90
// --- SLO targets (Req 21.1, 21.2, 21.3) ---
/** API_Gateway target availability: proportion of non-5xx responses per UTC month. */
exports.SLO_AVAILABILITY_TARGET = 0.995;
/** Job_Scheduler target P50 dispatch latency (submission → dispatch), milliseconds. */
exports.SLO_P50_DISPATCH_LATENCY_MS = 800;
/** Job_Scheduler target job success rate (COMPLETE / terminal outcomes). */
exports.SLO_JOB_SUCCESS_RATE_TARGET = 0.9;
//# sourceMappingURL=constants.js.map