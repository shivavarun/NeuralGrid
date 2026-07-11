/**
 * Shared TypeScript interfaces for NeuralGrid services.
 */
export type Tier = "T1" | "T2" | "T3";
export type Quantization = "fp32" | "fp16" | "int8" | "int4";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type JobStatus = "queued" | "running" | "complete" | "failed";
export type Provider = "vastai" | "runpod";
export interface EstimateRequest {
    model: string;
    quantization?: Quantization;
    input_tokens?: number;
    max_tokens?: number;
}
export interface EstimateResponse {
    tier: Tier;
    min_vram_gb: number;
    estimated_runtime_seconds: number;
    estimated_cost_usd: string;
    confidence: Confidence;
}
export interface PriceRequest {
    tier: Tier;
}
export interface PriceResponse {
    nodes: ProviderNode[];
    cached: boolean;
    cache_age_seconds: number;
}
export interface ProviderNode {
    provider: Provider;
    node_id: string;
    gpu_model: string;
    vram_gb: number;
    hourly_rate_usd: number;
    availability: boolean;
}
export interface JobInput {
    type: string;
    content: string;
}
export interface JobOutput {
    type: "text" | "image";
    max_tokens?: number;
    width?: number;
    height?: number;
}
export interface DispatchRequest {
    job_id: string;
    model: string;
    tier: Tier;
    input: JobInput;
    output: JobOutput;
    quantization: Quantization;
    selected_node: ProviderNode;
}
export interface JobResult {
    content?: string;
    tokens_generated?: number;
    model?: string;
    finish_reason?: "stop" | "length" | "error";
    image_urls?: string[];
    expires_at?: string;
    width?: number;
    height?: number;
}
export interface JobStatusResponse {
    job_id: string;
    status: JobStatus;
    provider?: string;
    actual_cost_usd?: string;
    result?: JobResult;
    retries: number;
}
export interface IdempotencyRecord {
    user_id: string;
    idempotency_key: string;
    job_id: string;
    request_hash: string;
    response_snapshot: JobStatusResponse;
    created_at: string;
}
export interface SoftQueueEntry {
    job_id: string;
    assigned_tier: Tier;
    queue_wait_anchor: number;
}
export interface CircuitBreakerState {
    provider_id: string;
    failure_timestamps: number[];
    state: "closed" | "open";
    opened_at?: number;
}
export interface JobTimeout {
    job_id: string;
    dispatched_at: number;
    timeout_ms: number;
}
export type JobOutputKind = "text" | "image" | "embeddings";
export interface OutputValidator {
    validate(job_type: string, result: Buffer | string): ValidationOutcome;
}
export type ValidationOutcome = {
    valid: true;
} | {
    valid: false;
    error_code: "INVALID_OUTPUT";
};
export type BillingEventType = "charge" | "credit" | "topup" | "refund";
export interface BillingEvent {
    id: string;
    user_id: string;
    job_id?: string;
    type: BillingEventType;
    amount_usd: number;
    provider_cost_usd?: number;
    margin_usd?: number;
    charge_consistent?: boolean;
    credit_of_event?: string;
    created_at: string;
    reconciled_stripe_id?: string;
}
export interface RefundOutcome {
    status: "refunded" | "no_charge" | "already_credited" | "refund-pending";
}
export interface AdminSession {
    user_id: string;
    role: "admin";
    last_auth_at: string;
}
export interface SignedInbound {
    raw_body: Buffer;
    signature_header?: string;
    timestamp: number;
}
export type VerifyResult = {
    ok: true;
} | {
    ok: false;
    reason: "missing" | "invalid" | "replay";
};
export type AlertKind = "breaker_open" | "success_rate_low" | "billing_mismatch" | "http_5xx_high" | "breaker_open_prolonged";
export interface Page {
    kind: AlertKind;
    dedupe_key: string;
    raised_at: number;
    acknowledged: boolean;
}
//# sourceMappingURL=types.d.ts.map