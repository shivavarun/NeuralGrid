'use client';

import { useEffect, useRef, useState } from 'react';
import { SAMPLE_JOBS } from '../content/sampleJobs';
import { nextJobIndex, CYCLE_INTERVAL_MS } from './lib/computeEstimator';
import { shouldAnnounce } from './lib/liveRegionThrottle';
import { TierIndicatorStrip } from './TierIndicatorStrip';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

/**
 * Autonomous telemetry panel. Cycles through SAMPLE_JOBS on a fixed interval
 * with no visitor interaction of any kind. A throttled aria-live region
 * announces the current job for assistive tech (Requirement 13.3).
 */
export function ComputeEstimatorPanel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [announcedIndex, setAnnouncedIndex] = useState(0);
  const lastAnnouncedAtRef = useRef<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const id = setInterval(() => {
      setCurrentIndex((i) => nextJobIndex(i, SAMPLE_JOBS.length));
    }, CYCLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const now = Date.now();
    if (shouldAnnounce(lastAnnouncedAtRef.current, now, 5000)) {
      lastAnnouncedAtRef.current = now;
      setAnnouncedIndex(currentIndex);
    }
  }, [currentIndex]);

  const job = SAMPLE_JOBS[currentIndex];
  const announcedJob = SAMPLE_JOBS[announcedIndex];

  return (
    <div className="rounded-xl border border-[#212930] bg-[#12171C] p-5 font-[family-name:var(--font-mono)]">
      <div className="mb-4 flex items-center justify-between border-b border-[#1A2026] pb-3 text-[11px] uppercase tracking-wide text-[#5C6670]">
        <span>Compute Estimator</span>
        <span className="flex items-center gap-1.5 text-[#3DDC97]">
          <span
            className={`h-1.5 w-1.5 rounded-full bg-[#3DDC97] ${
              prefersReducedMotion ? '' : 'animate-pulse'
            }`}
          />
          live
        </span>
      </div>

      <div aria-live="polite" className="mb-3 text-sm text-[#8B96A1]">
        Job in: <span className="text-[#E7EDF2]">{announcedJob.name}</span>
      </div>

      <TierIndicatorStrip activeTier={job.tier} />

      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div className="rounded-md border border-[#212930] bg-[#0E1216] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-[#5C6670]">VRAM</div>
          <div className="text-[#E7EDF2]">{job.vramGb.toFixed(1)} GB</div>
        </div>
        <div className="rounded-md border border-[#212930] bg-[#0E1216] px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wide text-[#5C6670]">Confidence</div>
          <div className="text-[#E7EDF2]">{job.confidence}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md border border-[#212930] bg-[#0E1216] px-3 py-2.5 text-[13px]">
        <span className="text-[10px] uppercase tracking-wide text-[#5C6670]">Routed to</span>
        <span className="text-[#7FD1FF]">
          {job.provider} · ${job.costUsd.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
