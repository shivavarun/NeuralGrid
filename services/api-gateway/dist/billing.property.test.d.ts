export interface CompletedJob {
    job_id: string;
    actual_cost_usd: number;
    runtime_seconds: number;
}
export interface BillingMetrics {
    totalSpend: number;
    runpodEquivalent: number;
    savingsPct: number;
}
/**
 * Compute billing metrics for a set of completed jobs in a billing period.
 * - totalSpend: sum of actual_cost_usd for all jobs
 * - runpodEquivalent: sum of (RUNPOD_A100_HOURLY_RATE × runtime_seconds / 3600)
 * - savingsPct: (runpodEquivalent - totalSpend) / runpodEquivalent × 100
 *   Returns 0 when runpodEquivalent is 0 (no runtime).
 */
export declare function computeBillingMetrics(jobs: CompletedJob[]): BillingMetrics;
