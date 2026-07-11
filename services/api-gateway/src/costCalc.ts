/**
 * Cost calculation module (production readiness, Req 22.3).
 *
 * Owns the two billing-critical calculations that the CI unit-coverage gate
 * (task 27.1) protects:
 *
 *  1. Margin application: the customer cost is the base provider cost plus the
 *     `neuralgrid_margin` percentage. The provider-cost line and margin line are
 *     returned separately (2 dp each) so they can be persisted as the auditable
 *     line items the ledger expects (Req 10.1).
 *
 *  2. RunPod A100 baseline comparison: given a job's runtime, compute the
 *     equivalent RunPod A100 cost and the developer's savings, expressed both as
 *     an absolute USD amount and as a percentage. Savings may be zero or
 *     negative when the customer cost meets or exceeds the RunPod baseline; that
 *     case is handled explicitly rather than clamped.
 *
 * Everything here is pure and deterministic given its inputs, so it is trivially
 * unit-testable and measurable by the coverage gate in isolation.
 *
 * Requirements: 22.3, 10.1
 */

/** Default NeuralGrid margin applied on top of provider cost, in percent. */
export const NEURALGRID_MARGIN_PCT = 20;

/** RunPod A100 80GB hourly rate (USD) used as the savings baseline. */
export const RUNPOD_A100_RATE_PER_HOUR = 3.09;

/** Round a USD amount to 2 decimal places. */
export function roundUsd(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export interface MarginBreakdown {
  /** Base provider cost line item (2 dp). */
  provider_cost_usd: number;
  /** NeuralGrid margin line item (2 dp). */
  margin_usd: number;
  /** Total charged to the customer = provider_cost + margin (2 dp). */
  customer_cost_usd: number;
}

/**
 * Apply the NeuralGrid margin to a base provider cost.
 *
 * @param baseProviderCostUsd base provider cost (USD, magnitude >= 0)
 * @param marginPct margin percentage (defaults to {@link NEURALGRID_MARGIN_PCT})
 */
export function applyMargin(
  baseProviderCostUsd: number,
  marginPct: number = NEURALGRID_MARGIN_PCT
): MarginBreakdown {
  const provider_cost_usd = roundUsd(baseProviderCostUsd);
  const margin_usd = roundUsd((baseProviderCostUsd * marginPct) / 100);
  const customer_cost_usd = roundUsd(provider_cost_usd + margin_usd);
  return { provider_cost_usd, margin_usd, customer_cost_usd };
}

export interface BaselineComparison {
  /** Equivalent RunPod A100 cost for the same runtime (2 dp). */
  runpod_cost_usd: number;
  /** Absolute savings vs RunPod: runpod_cost - customer_cost (may be <= 0). */
  absolute_savings_usd: number;
  /**
   * Savings as a percentage of the RunPod baseline (may be <= 0). Defined as 0
   * when the baseline cost is 0 (no meaningful percentage).
   */
  saving_pct: number;
}

/**
 * Compute the RunPod A100 baseline comparison for a given customer cost and
 * runtime. Absolute savings and percentage may be zero or negative.
 *
 * @param customerCostUsd what the developer is charged (USD)
 * @param runtimeSeconds job runtime in seconds
 * @param runpodRatePerHour RunPod A100 hourly rate (defaults to the constant)
 */
export function computeBaselineComparison(
  customerCostUsd: number,
  runtimeSeconds: number,
  runpodRatePerHour: number = RUNPOD_A100_RATE_PER_HOUR
): BaselineComparison {
  const runtimeHours = runtimeSeconds / 3600;
  const runpod_cost_usd = roundUsd(runpodRatePerHour * runtimeHours);
  const absolute_savings_usd = roundUsd(runpod_cost_usd - roundUsd(customerCostUsd));

  let saving_pct = 0;
  if (runpod_cost_usd > 0) {
    saving_pct =
      Math.round(((runpod_cost_usd - customerCostUsd) / runpod_cost_usd) * 10000) /
      100;
  }

  return { runpod_cost_usd, absolute_savings_usd, saving_pct };
}

export interface JobCost extends MarginBreakdown {
  baseline: BaselineComparison;
}

/**
 * Full job cost calculation: margin-applied customer cost plus the RunPod A100
 * baseline comparison, in one call.
 */
export function calculateJobCost(
  baseProviderCostUsd: number,
  runtimeSeconds: number,
  opts: { marginPct?: number; runpodRatePerHour?: number } = {}
): JobCost {
  const margin = applyMargin(baseProviderCostUsd, opts.marginPct);
  const baseline = computeBaselineComparison(
    margin.customer_cost_usd,
    runtimeSeconds,
    opts.runpodRatePerHour
  );
  return { ...margin, baseline };
}
