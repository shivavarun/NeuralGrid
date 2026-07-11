/**
 * UI-facing response types for the NeuralGrid dashboard.
 *
 * Mirrors @neuralgrid/shared where types exist and extends with UI-only shapes.
 * Backend-gap fields are marked optional with comments.
 */

// --- Re-declared from @neuralgrid/shared (dashboard does not import the package) ---

export type Tier = 'T1' | 'T2' | 'T3';
export type Provider = 'vastai' | 'runpod' | 'fireworks' | 'amd-cloud';
export type HardwareVendor = 'NVIDIA' | 'AMD';

// --- UI-specific types ---

/**
 * The dashboard's 7-state status vocabulary (Req 3.1).
 * @neuralgrid/shared's JobStatus has only 4 states (queued|running|complete|failed).
 * estimating/dispatched/cancelled are UI/PRD states; backend must emit these or the
 * UI maps unknown statuses to the closest known state. Tracked as a backend gap.
 */
export type UiJobStatus =
  | 'queued'
  | 'estimating'
  | 'dispatched'
  | 'running'
  | 'complete'
  | 'failed'
  | 'cancelled';

/** A row in the jobs table (Jobs_Page, Home feed, Admin_Jobs_Page). */
export interface JobRow {
  id: string;
  model: string;
  tier: Tier;
  status: UiJobStatus;
  provider?: Provider;
  hardware_vendor?: HardwareVendor;
  /** null while pending — CostDisplay renders "estimating..." */
  actual_cost_usd?: number | null;
  /** RunPod A100 baseline for savings calculation */
  runpod_a100_baseline_usd?: number | null;
  created_at: string;
  completed_at?: string;
}

/**
 * Cost_Comparison_Service response — GET /v1/jobs/:id/cost-comparison (stage2 shape).
 */
export interface CostComparisonResponse {
  job_id: string;
  actual_cost_usd: string;
  runpod_a100_baseline_usd: string;
  /** Per configured provider cost estimate */
  estimates: Partial<Record<Provider, string>>;
}

/**
 * Savings analytics — GET /v1/analytics/savings (stage2).
 */
export interface SavingsResponse {
  total_saved_usd: string;
  job_count: number;
  per_model: Array<{
    model: string;
    jobs: number;
    avg_neuralgrid_usd: string;
    avg_a100_usd: string;
    avg_savings_pct: number;
  }>;
  /** 6-month history for the Home_Page spend bar chart */
  monthly: Array<{
    month: string;
    neuralgrid_usd: string;
    a100_usd: string;
  }>;
}

/**
 * Admin_Health_Endpoint — GET /internal/health (stage2 existing fields).
 */
export interface HealthResponse {
  subsystems: Record<string, 'green' | 'amber' | 'red'>;
  providers: Array<{
    provider: Provider;
    status: 'green' | 'amber' | 'red';
    lastPoll: string;
    nodesAvailable: number;
    circuitBreaker: 'closed' | 'open' | 'half-open';
    cooldownRemainingSec?: number;
    consecutiveFailures: number;
    jobs: { last1h: number; last24h: number };
    /** GAP (Req 21.4/21.5): NOT returned by backend today */
    perTierInventory?: Array<{ tier: Tier; count: number; cheapestUsdPerHr: string }>;
    /** GAP (Req 21.5): NOT returned by backend today */
    priceCacheFreshness?: { refreshedSecAgo: number; expiresInSec: number };
  }>;
  metrics: {
    queued: number;
    running: number;
    successRate1h: number;
    activeUsers24h: number;
  };
  /** GAP: Estimator accuracy aggregation may not be present */
  estimatorAccuracy?: { correct: number; over: number; under: number; total: number };
}

/**
 * Admin platform settings — GET/PATCH /v1/admin/settings.
 * BACKEND GAP: entire endpoint does not exist yet (Req 25).
 */
export interface AdminSettings {
  routing: {
    t1VramCeiling: number;
    t2VramCeiling: number;
    t3VramFloor: number;
    maxRetries: number;
    timeoutMultiplier: number;
    lowConfidenceBump: boolean;
  };
  provider: {
    pricePollIntervalSec: number;
    priceCacheTtlSec: number;
    breakerThreshold: number;
    breakerCooldownSec: number;
    amdBonusPct: number;
  };
  billing: {
    marginPct: number;
    freeTierCreditUsd: string;
    lowBalanceWarnUsd: string;
    autoTopUpMinUsd: string;
    maxJobCostUsd: string;
  };
  rateLimits: Record<'free' | 'pro' | 'enterprise', { perMin: number; perDay: number }>;
}

/**
 * Audit log entry — used by impersonation (Req 20.4), registry changes (Req 23.6),
 * and settings changes (Req 25.5).
 * BACKEND GAP: no audit-log storage/endpoint exists yet.
 */
export interface AuditLogEntry {
  actorEmail: string;
  action: string;
  targetId?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  timestamp: string;
}
