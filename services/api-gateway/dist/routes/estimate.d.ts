/**
 * Cost estimate endpoint — GET /v1/models/:model_id/estimate
 * Calls Compute_Estimator, adds RunPod A100 comparison with savings percentage.
 */
import { Router } from 'express';
export declare const RUNPOD_A100_RATE_PER_HOUR = 3.09;
export interface HttpClient {
    post(url: string, body: unknown): Promise<{
        status: number;
        data: unknown;
    }>;
}
export declare const defaultHttpClient: HttpClient;
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
export interface EstimateRouterDeps {
    httpClient?: HttpClient;
}
export declare function createEstimateRouter(deps?: EstimateRouterDeps): Router;
