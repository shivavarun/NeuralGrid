/**
 * Typed API Client for the NeuralGrid Dashboard.
 * Extends the base ApiClient with error classification, retry-after handling,
 * and typed methods for all dashboard/admin endpoints.
 */

import type {
  JobRow,
  CostComparisonResponse,
  SavingsResponse,
  HealthResponse,
  AdminSettings,
  AuditLogEntry,
} from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export type ApiErrorKind =
  | 'unauthorized'
  | 'rate_limited'
  | 'server_error'
  | 'client_error'
  | 'network';

/** Pure classifier — unit-testable without network. */
export function classifyApiError(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'client_error';
}

// ---------------------------------------------------------------------------
// ApiRequestError
// ---------------------------------------------------------------------------

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public kind: ApiErrorKind,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Shared response types used only by the client (not UI-facing)
// ---------------------------------------------------------------------------

export interface Job {
  id: string;
  model: string;
  tier: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  estimated_cost_usd: string;
  actual_cost_usd?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

/** Billing summary response */
export interface BillingSummary {
  balance_usd: string;
  jobs_this_month: number;
  spend_this_month_usd: string;
  savings_vs_a100_usd: string;
  savings_vs_a100_pct: number;
  most_expensive_job_id?: string;
  month_over_month_trend_pct?: number;
}

/** Invoice row */
export interface Invoice {
  id: string;
  amount_usd: string;
  status: 'paid' | 'pending' | 'failed';
  created_at: string;
  description?: string;
}

/** API key row */
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  status: 'active' | 'revoked';
  last_used?: string;
  created_at: string;
}

/** API key creation response — includes full key once */
export interface ApiKeyCreated {
  id: string;
  name: string;
  key: string;
  prefix: string;
  created_at: string;
}

/** What-if calculator response */
export interface WhatIfResponse {
  monthly_neuralgrid_usd: string;
  monthly_a100_usd: string;
  monthly_aws_usd: string;
  annual_savings_usd: string;
}

/** Admin job filters */
export interface AdminJobFilters {
  developer_email?: string;
  developer_id?: string;
  provider?: string;
  failure_reason?: string;
  status?: string;
  cursor?: string;
  limit?: number;
}

/** Admin user row */
export interface AdminUser {
  id: string;
  email: string;
  plan: string;
  balance_usd: string;
  jobs_30d: number;
  spend_30d_usd: string;
  last_active: string;
  status: 'active' | 'suspended';
}

/** Admin estimator accuracy */
export interface EstimatorAccuracy {
  correct: number;
  over: number;
  under: number;
  total: number;
  per_model: Array<{
    model: string;
    jobs: number;
    correct: number;
    over: number;
    under: number;
  }>;
}

/** Admin revenue response */
export interface AdminRevenue {
  mrr_usd: string;
  revenue_today_usd: string;
  provider_cost_today_usd: string;
  gross_margin_pct: number;
  daily: Array<{
    date: string;
    revenue_usd: string;
    cost_usd: string;
  }>;
}

/** Admin log filters */
export interface AdminLogFilters {
  severity?: string;
  service?: string;
  search?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** Admin log entry */
export interface AdminLogEntry {
  id: string;
  timestamp: string;
  severity: 'info' | 'warn' | 'error' | 'fatal';
  service: string;
  message: string;
  context?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

export class ApiClient {
  private baseUrl: string;
  private token?: string;

  constructor(token?: string) {
    this.baseUrl = API_BASE_URL;
    this.token = token;
  }

  private async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const { method = 'GET', body } = options;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const authToken = options.token || this.token;
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new ApiRequestError(0, 'network', 'NETWORK_ERROR', (err as Error).message);
    }

    if (!response.ok) {
      const kind = classifyApiError(response.status);
      let code = 'UNKNOWN';
      let message = response.statusText;
      let retryAfterSeconds: number | undefined;

      try {
        const errorBody: ApiErrorBody = await response.json();
        code = errorBody.error.code;
        message = errorBody.error.message;
      } catch {
        // body not parseable — use defaults
      }

      if (response.status === 429) {
        const ra = response.headers.get('Retry-After');
        if (ra) retryAfterSeconds = parseInt(ra, 10) || undefined;
      }

      throw new ApiRequestError(response.status, kind, code, message, retryAfterSeconds);
    }

    return response.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Jobs
  // -------------------------------------------------------------------------

  async listJobs(): Promise<Job[]> {
    return this.request<Job[]>('/v1/jobs');
  }

  async getJob(id: string): Promise<JobRow> {
    return this.request<JobRow>(`/v1/jobs/${id}`);
  }

  async submitJob(payload: { model: string; input: unknown; output: unknown; quantization?: string }) {
    return this.request('/v1/jobs', { method: 'POST', body: payload });
  }

  async getJobStatus(jobId: string) {
    return this.request(`/v1/jobs/${jobId}`);
  }

  async getJobResult(jobId: string) {
    return this.request(`/v1/jobs/${jobId}/result`);
  }

  // -------------------------------------------------------------------------
  // Cost & Savings
  // -------------------------------------------------------------------------

  async getCostComparison(jobId: string): Promise<CostComparisonResponse> {
    return this.request<CostComparisonResponse>(`/v1/jobs/${jobId}/cost-comparison`);
  }

  async getSavings(): Promise<SavingsResponse> {
    return this.request<SavingsResponse>('/v1/analytics/savings');
  }

  async getWhatIf(model: string, count: number): Promise<WhatIfResponse> {
    const params = new URLSearchParams({ model, count: String(count) });
    return this.request<WhatIfResponse>(`/v1/analytics/what-if?${params.toString()}`);
  }

  // -------------------------------------------------------------------------
  // API Keys
  // -------------------------------------------------------------------------

  async listApiKeys(): Promise<ApiKey[]> {
    return this.request<ApiKey[]>('/v1/keys');
  }

  async createApiKey(name: string): Promise<ApiKeyCreated> {
    return this.request<ApiKeyCreated>('/v1/keys', { method: 'POST', body: { name } });
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.request<void>(`/v1/keys/${id}/revoke`, { method: 'POST' });
  }

  // -------------------------------------------------------------------------
  // Billing
  // -------------------------------------------------------------------------

  async getBillingSummary(): Promise<BillingSummary> {
    return this.request<BillingSummary>('/v1/billing/summary');
  }

  async getInvoices(): Promise<Invoice[]> {
    return this.request<Invoice[]>('/v1/billing/invoices');
  }

  // -------------------------------------------------------------------------
  // Models
  // -------------------------------------------------------------------------

  async listModels() {
    return this.request('/v1/models');
  }

  async getEstimate(modelId: string, params: { input_tokens?: number; max_tokens?: number; quantization?: string }) {
    const query = new URLSearchParams();
    if (params.input_tokens) query.set('input_tokens', String(params.input_tokens));
    if (params.max_tokens) query.set('max_tokens', String(params.max_tokens));
    if (params.quantization) query.set('quantization', params.quantization);
    return this.request(`/v1/models/${modelId}/estimate?${query.toString()}`);
  }

  // -------------------------------------------------------------------------
  // Admin endpoints
  // -------------------------------------------------------------------------

  async adminGetHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/internal/health');
  }

  async adminListJobs(filters?: AdminJobFilters): Promise<JobRow[]> {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.developer_email) params.set('developer_email', filters.developer_email);
      if (filters.developer_id) params.set('developer_id', filters.developer_id);
      if (filters.provider) params.set('provider', filters.provider);
      if (filters.failure_reason) params.set('failure_reason', filters.failure_reason);
      if (filters.status) params.set('status', filters.status);
      if (filters.cursor) params.set('cursor', filters.cursor);
      if (filters.limit) params.set('limit', String(filters.limit));
    }
    const qs = params.toString();
    return this.request<JobRow[]>(`/v1/admin/jobs${qs ? `?${qs}` : ''}`);
  }

  async adminListUsers(): Promise<AdminUser[]> {
    return this.request<AdminUser[]>('/v1/admin/users');
  }

  async adminGetEstimatorAccuracy(): Promise<EstimatorAccuracy> {
    return this.request<EstimatorAccuracy>('/v1/admin/estimator-accuracy');
  }

  async adminGetRevenue(window: '30d' | '90d' = '30d'): Promise<AdminRevenue> {
    return this.request<AdminRevenue>(`/v1/admin/revenue?window=${window}`);
  }

  async adminGetLogs(filters?: AdminLogFilters): Promise<AdminLogEntry[]> {
    const params = new URLSearchParams();
    if (filters) {
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.service) params.set('service', filters.service);
      if (filters.search) params.set('search', filters.search);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.cursor) params.set('cursor', filters.cursor);
      if (filters.limit) params.set('limit', String(filters.limit));
    }
    const qs = params.toString();
    return this.request<AdminLogEntry[]>(`/v1/admin/logs${qs ? `?${qs}` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new client instance, optionally with a pre-set auth token. */
export function createApiClient(token?: string): ApiClient {
  return new ApiClient(token);
}
