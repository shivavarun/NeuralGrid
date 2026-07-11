/** Pure. For any non-empty length, wraps from the last index back to 0. */
export function nextJobIndex(currentIndex: number, length: number): number {
  if (length <= 0) throw new Error('nextJobIndex requires a non-empty list');
  return (currentIndex + 1) % length;
}

export const CYCLE_INTERVAL_MS = 3200;
