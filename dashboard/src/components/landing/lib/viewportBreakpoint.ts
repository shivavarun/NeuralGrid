'use client';
import { useEffect, useState } from 'react';

/** Pure. True for any width strictly less than threshold. */
export function isBelowBreakpoint(width: number, threshold: number): boolean {
  return width < threshold;
}

/**
 * Live-updating, SSR-safe (defaults to false pre-mount, matching the
 * existing usePrefersReducedMotion convention). Backed by matchMedia so
 * resize/orientation changes are picked up without a page reload
 * (Requirement 12.7) via native DOM APIs only (Requirement 14.2).
 */
export function useViewportBreakpoint(thresholdPx: number): boolean {
  const [isBelow, setIsBelow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${thresholdPx - 1}px)`);
    setIsBelow(query.matches);
    const handleChange = (event: MediaQueryListEvent) => setIsBelow(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, [thresholdPx]);

  return isBelow;
}
