export type Tier = 'T1' | 'T2' | 'T3';

export const TIER_COLORS: Record<Tier, string> = {
  T1: '#3DDC97',
  T2: '#F5A623',
  T3: '#FF5470',
};

export const ACCENT_CYAN = '#7FD1FF';
export const BG_COLOR = '#0A0D10';

/** Pure, deterministic. Distinct across T1/T2/T3, and distinct from BG_COLOR/ACCENT_CYAN. */
export function tierColor(tier: Tier): string {
  return TIER_COLORS[tier];
}
