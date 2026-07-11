// src/components/content/competitors.ts
// Competitor comparison table removed per AMD-only positioning update.
// NeuralGrid now operates exclusively on AMD Developer Cloud — no multi-provider comparison needed.
// Interface and NEURALGRID_ROW kept for backward compatibility (ComparisonSection renders nothing).

export interface CompetitorRow {
  name: string;
  autoTierRouting: boolean;
}

export const COMPETITORS: CompetitorRow[] = [];

export const NEURALGRID_ROW: CompetitorRow = { name: 'NeuralGrid', autoTierRouting: true };
