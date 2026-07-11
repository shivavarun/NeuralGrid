/**
 * Shared TypeScript interfaces for NeuralGrid services.
 */

// --- Tier and Quantization types ---

export type Tier = "T1" | "T2" | "T3";
export type Quantization = "fp32" | "fp16" | "int8" | "int4";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export type JobStatus = "queued" | "running" | "complete" | "failed";
export type Provider = "vastai" | "runpod";

// --- Compute Estimator ---

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

// --- Price Aggregator ---

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

// --- Job Scheduler ---

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
  // Text output fields
  content?: string;
  tokens_generated?: number;
  model?: string;
  finish_reason?: "stop" | "length" | "error";
  // Image output fields
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

// --- Production readiness: Idempotency ---

export interface IdempotencyRecord {
  user_id: string;
  idempotency_key: string; // 1..255 chars, per-user unique
  job_id: string;
  request_hash: string; // sha256 of canonical request body bytes
  response_snapshot: JobStatusResponse;
  created_at: string; // association retained 24h
}

// --- Production readiness: Job_Scheduler ---

export interface SoftQueueEntry {
  job_id: string;
  assigned_tier: Tier;
  queue_wait_anchor: number; // ms epoch; FIFO ordering key; 30s bound
}

export interface CircuitBreakerState {
  provider_id: string;
  failure_timestamps: number[]; // rolling 60s window; open at 3
  state: "closed" | "open";
  opened_at?: number; // closes after 5 min
}

export interface JobTimeout {
  job_id: string;
  dispatched_at: number;
  timeout_ms: number; // estimated_runtime_ms * 3
}

// --- Production readiness: Output validation ---

export type JobOutputKind = "text" | "image" | "embeddings";

export interface OutputValidator {
  validate(job_type: string, result: Buffer | string): ValidationOutcome;
}

export type ValidationOutcome =
  | { valid: true }
  | { valid: false; error_code: "INVALID_OUTPUT" }; // also when no rule defined

// --- Production readiness: Billing_Service ---

export type BillingEventType = "charge" | "credit" | "topup" | "refund";

export interface BillingEvent {
  id: string;
  user_id: string;
  job_id?: string;
  type: BillingEventType;
  amount_usd: number; // negative for charge; positive for credit/topup/refund
  provider_cost_usd?: number; // charge line item
  margin_usd?: number; // charge line item
  charge_consistent?: boolean; // false => provider_cost + margin != total (Req 10.3)
  credit_of_event?: string; // links a credit row to the charge it refunds (Req 9.3)
  created_at: string;
  reconciled_stripe_id?: string;
}

export interface RefundOutcome {
  status: "refunded" | "no_charge" | "already_credited" | "refund-pending";
}

// --- Production readiness: Admin / security ---

export interface AdminSession {
  user_id: string;
  role: "admin";
  last_auth_at: string; // mutations rejected if age > 12h
}

export interface SignedInbound {
  raw_body: Buffer;
  signature_header?: string; // missing => reject
  timestamp: number; // reject if |now - timestamp| > 300s
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "replay" };

// --- Production readiness: Notification_Service ---

export type AlertKind =
  | "breaker_open"
  | "success_rate_low"
  | "billing_mismatch"
  | "http_5xx_high"
  | "breaker_open_prolonged";

export interface Page {
  kind: AlertKind;
  dedupe_key: string; // suppress duplicates while condition active
  raised_at: number;
  acknowledged: boolean; // re-page if unacked after 15 min
}
