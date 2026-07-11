/**
 * Pure utility functions for the dashboard.
 * Each function is property-testable and side-effect free.
 */

/**
 * Property 1: Format a monetary value to exactly 4 decimal places with $ prefix.
 * The ONLY monetary formatter in the dashboard.
 */
export function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

/**
 * Property 4: Balance color thresholds.
 * green if b > 5, amber if 1 <= b <= 5, red if b < 1.
 */
export function balanceColor(b: number): 'green' | 'amber' | 'red' {
  if (b > 5) return 'green';
  if (b >= 1) return 'amber';
  return 'red';
}

/**
 * Property 3: Queue card color step function.
 * normal for 0-50, amber for 51-200, red for >200.
 */
export function queueCardColor(queued: number): 'normal' | 'amber' | 'red' {
  if (queued > 200) return 'red';
  if (queued > 50) return 'amber';
  return 'normal';
}

/**
 * Property 5: Admin role check.
 * Returns true iff role === 'admin'.
 */
export function isAdminRole(role: string): boolean {
  return role === 'admin';
}

/**
 * Property 6: Retry action visibility.
 * Returns true iff status === 'failed'.
 */
export function showRetryAction(status: string): boolean {
  return status === 'failed';
}

/** Legacy route mapping type */
type LegacyRoute = '/jobs' | '/keys' | '/billing';

const LEGACY_REDIRECT_MAP: Record<LegacyRoute, string> = {
  '/jobs': '/dashboard/jobs',
  '/keys': '/dashboard/api-keys',
  '/billing': '/dashboard/billing',
};

/**
 * Property 7: Legacy route redirect mapping.
 * Total function over the legacy route domain.
 */
export function legacyRedirectTarget(route: LegacyRoute): string {
  return LEGACY_REDIRECT_MAP[route];
}

/**
 * Property 8: Admin margin calculation.
 * billed - provider, sign-correct including negatives.
 */
export function computeMargin(
  billed: number,
  provider: number,
): { dollars: number; pct: number | null } {
  const dollars = billed - provider;
  const pct = billed > 0 ? ((billed - provider) / billed) * 100 : null;
  return { dollars, pct };
}

/** Estimator alert state */
export type EstimatorAlert = 'no-data' | 'ok' | 'alert';

export interface AccuracyRecord {
  classification: 'correct' | 'over' | 'under';
}

/**
 * Property 9: Estimator under-estimation alert.
 * 'no-data' when empty, 'alert' when under-estimation rate > 5%, 'ok' otherwise.
 */
export function estimatorAlertState(records: AccuracyRecord[]): EstimatorAlert {
  if (records.length === 0) return 'no-data';
  const underCount = records.filter((r) => r.classification === 'under').length;
  const rate = underCount / records.length;
  return rate > 0.05 ? 'alert' : 'ok';
}
