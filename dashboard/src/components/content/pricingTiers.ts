// src/components/content/pricingTiers.ts — AMD Instinct tiers on AMD Developer Cloud
export interface PricingTierRow {
  tier: 'T1' | 'T2' | 'T3';
  label: string;
  vramRange: string;
  hardware: string;
  priceRange: string;
  exampleWorkload: string;
}

export const PRICING_TIERS: PricingTierRow[] = [
  { tier: 'T1', label: 'Lite', vramRange: '0–16GB', hardware: 'AMD Instinct MI210 (partitioned)', priceRange: '$0.04–0.08/hr', exampleWorkload: 'Small LLM inference (Llama-3-8B)' },
  { tier: 'T2', label: 'Standard', vramRange: '16–64GB', hardware: 'AMD Instinct MI300X (partitioned)', priceRange: '$0.18–0.35/hr', exampleWorkload: 'SDXL-class image generation' },
  { tier: 'T3', label: 'Power', vramRange: '64GB+', hardware: 'AMD Instinct MI300X (full node, 192GB)', priceRange: '$0.60–1.10/hr', exampleWorkload: 'Llama-3-70B inference' },
];
