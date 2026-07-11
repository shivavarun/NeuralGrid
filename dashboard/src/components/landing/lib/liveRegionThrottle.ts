/** Pure, single-step. True if never announced, or enough time has passed. */
export function shouldAnnounce(lastAnnouncedAt: number | null, now: number, minIntervalMs: number): boolean {
  return lastAnnouncedAt === null || now - lastAnnouncedAt >= minIntervalMs;
}

/**
 * Pure, sequence-level. Given an ascending sequence of update timestamps,
 * returns the subsequence that would actually be announced under the
 * minIntervalMs floor — useful directly in property tests.
 */
export function foldAnnouncements(timestamps: number[], minIntervalMs: number): number[] {
  const announced: number[] = [];
  let last: number | null = null;
  for (const t of timestamps) {
    if (shouldAnnounce(last, t, minIntervalMs)) {
      announced.push(t);
      last = t;
    }
  }
  return announced;
}
