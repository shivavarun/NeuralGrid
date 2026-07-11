export interface ParsedTierLabel {
  tier: 'T1' | 'T2' | 'T3' | null;
  remainder: string;
}

const TIER_PATTERN = /\bT[123]\b/;

/** Pure. Extracts the tier token from anywhere in the label; remainder is
 *  the label with that token and its adjacent separator characters removed. */
export function parseTierLabel(label: string): ParsedTierLabel {
  const match = label.match(TIER_PATTERN);
  if (!match) return { tier: null, remainder: label.trim() };
  const tier = match[0] as 'T1' | 'T2' | 'T3';
  const remainder = label
    .replace(TIER_PATTERN, '')
    .replace(/^[\s—\-–·]+|[\s—\-–·]+$/g, '')
    .trim();
  return { tier, remainder };
}
