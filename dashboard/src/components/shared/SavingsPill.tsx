"use client";

import { cn } from "@/lib/utils";

/**
 * Returns true iff both costs are present (non-null, non-undefined) and baseline > 0.
 */
export function shouldRenderSavings(
  actual: number | null | undefined,
  baseline: number | null | undefined
): boolean {
  return actual != null && baseline != null && baseline > 0;
}

/**
 * Computes savings percentage: (baseline - actual) / baseline * 100.
 * Caller must ensure baseline > 0.
 */
export function computeSavingsPct(actual: number, baseline: number): number {
  return ((baseline - actual) / baseline) * 100;
}

export interface SavingsPillProps {
  actualCost: number | null | undefined;
  baselineCost: number | null | undefined;
  className?: string;
}

/**
 * Renders a green "saved N%" pill iff both costs present and baseline > 0.
 * Otherwise renders nothing.
 */
export function SavingsPill({ actualCost, baselineCost, className }: SavingsPillProps) {
  if (!shouldRenderSavings(actualCost, baselineCost)) {
    return null;
  }

  const pct = computeSavingsPct(actualCost!, baselineCost!);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-green-500/15 px-2.5 py-0.5 text-xs font-semibold text-green-400 border border-green-500/30",
        className
      )}
    >
      saved {Math.round(pct)}%
    </span>
  );
}
