"use client";

import { type Tier } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const TIER_CONFIG: Record<
  Tier,
  { label: string; colorClass: string; tooltip: string }
> = {
  T1: {
    label: "T1 \u2014 Lite",
    colorClass: "bg-ng-tier-1/15 text-ng-tier-1 border-ng-tier-1/30",
    tooltip: "0\u201316 GB VRAM \u00B7 AMD Instinct MI210",
  },
  T2: {
    label: "T2 \u2014 Standard",
    colorClass: "bg-ng-tier-2/15 text-ng-tier-2 border-ng-tier-2/30",
    tooltip: "16\u201364 GB VRAM \u00B7 AMD Instinct MI300X partition",
  },
  T3: {
    label: "T3 \u2014 Power",
    colorClass: "bg-ng-tier-3/15 text-ng-tier-3 border-ng-tier-3/30",
    tooltip: "64 GB+ VRAM \u00B7 AMD Instinct MI300X full node",
  },
};

export interface TierBadgeProps {
  tier: Tier;
}

export function TierBadge({ tier }: TierBadgeProps) {
  const { label, colorClass, tooltip } = TIER_CONFIG[tier];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
              colorClass
            )}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
