import React from 'react';
import { tierColor, type Tier } from './lib/tierColors';

interface TierBadgeProps {
  tier: Tier;
  children: React.ReactNode; // remainder text, e.g. "RTX 3060 (8GB)"
}

export function TierBadge({ tier, children }: TierBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-xs font-semibold"
      style={{ backgroundColor: `${tierColor(tier)}1f`, color: tierColor(tier) }}
    >
      {tier} · {children}
    </span>
  );
}
