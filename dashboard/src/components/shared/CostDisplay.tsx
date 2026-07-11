"use client";

import { formatCost } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CostDisplayProps {
  value: number | null | undefined;
  pending?: boolean;
  className?: string;
}

/**
 * Single monetary rendering path for the entire dashboard (Req 1.6).
 * - pending/null → "estimating..." italic muted
 * - 0 → "$0.0000" muted
 * - else → formatCost(value)
 */
export function CostDisplay({ value, pending, className }: CostDisplayProps) {
  if (pending || value == null) {
    return (
      <span className={cn("italic text-muted-foreground", className)}>
        estimating...
      </span>
    );
  }

  if (value === 0) {
    return (
      <span className={cn("text-muted-foreground font-mono text-sm", className)}>
        $0.0000
      </span>
    );
  }

  return (
    <span className={cn("font-mono text-sm", className)}>
      {formatCost(value)}
    </span>
  );
}
