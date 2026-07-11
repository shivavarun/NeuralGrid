'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UsePollingResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  lastUpdated: number | null;
}

export interface UsePollingOptions {
  enabled?: boolean;
  onError?: (e: unknown) => void;
}

/**
 * Polls a fetcher at a given interval. Pauses when tab is hidden.
 * Backs off on rate_limited (429) errors using retryAfterSeconds.
 * Never renders a page-level spinner — consumers show SkeletonScreen while data is undefined.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  opts?: UsePollingOptions
): UsePollingResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffUntilRef = useRef<number>(0);
  const fetcherRef = useRef(fetcher);
  const optsRef = useRef(opts);

  // Keep refs fresh without re-triggering effects
  fetcherRef.current = fetcher;
  optsRef.current = opts;

  const enabled = opts?.enabled !== false;

  const doFetch = useCallback(async () => {
    // Skip if backing off
    if (Date.now() < backoffUntilRef.current) return;

    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
      setLastUpdated(Date.now());
    } catch (e: unknown) {
      setError(e);
      optsRef.current?.onError?.(e);

      // Back off on rate_limited / 429
      if (isRateLimitedError(e)) {
        const retryAfter = getRetryAfterSeconds(e);
        backoffUntilRef.current = Date.now() + retryAfter * 1000;
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    doFetch();

    const scheduleNext = () => {
      timerRef.current = setTimeout(() => {
        if (document.visibilityState === 'hidden') {
          // Don't fetch while hidden; reschedule
          scheduleNext();
          return;
        }

        // If still in backoff, calculate remaining wait
        const now = Date.now();
        if (now < backoffUntilRef.current) {
          const remaining = backoffUntilRef.current - now;
          timerRef.current = setTimeout(() => {
            doFetch();
            scheduleNext();
          }, remaining);
          return;
        }

        doFetch();
        scheduleNext();
      }, intervalMs);
    };

    scheduleNext();

    // Resume polling when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Fetch immediately on becoming visible, then continue schedule
        doFetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, intervalMs, doFetch]);

  return { data, error, isLoading, lastUpdated };
}

/** Check if error is a rate-limited (429) error */
function isRateLimitedError(e: unknown): boolean {
  if (e && typeof e === 'object') {
    if ('status' in e && (e as { status: number }).status === 429) return true;
    if ('kind' in e && (e as { kind: string }).kind === 'rate_limited') return true;
  }
  return false;
}

/** Extract retryAfterSeconds from error, default 30s */
function getRetryAfterSeconds(e: unknown): number {
  if (e && typeof e === 'object' && 'retryAfterSeconds' in e) {
    const val = (e as { retryAfterSeconds: unknown }).retryAfterSeconds;
    if (typeof val === 'number' && val > 0) return val;
  }
  return 30;
}
