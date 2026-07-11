'use client';

import Link from 'next/link';
import {
  HERO_EYEBROW,
  HERO_HEADLINE_PLAIN,
  HERO_HEADLINE_ACCENT,
  HERO_HEADLINE_TAIL,
  HERO_SUBTEXT,
  HERO_STAT,
  PRIMARY_CTA_LABEL,
  SECONDARY_CTA_LABEL,
} from '../content/heroContent';
import { ComputeEstimatorPanel } from './ComputeEstimatorPanel';
import { useViewportBreakpoint } from './lib/viewportBreakpoint';

/**
 * Hero_Section: eyebrow, two-line accent headline, subtext, stat line,
 * Primary_CTA (link to /login) + Secondary_CTA (scrolls to How_It_Works_Section),
 * with the Compute_Estimator_Panel as the dominant visual element.
 *
 * Two-column layout above the 860px Viewport_Breakpoint (Requirement 12.2),
 * collapsing to a single column below it. No pointer/scroll capture and no
 * 3D scene (Requirements 5.6, 14.5).
 */
export function HeroSection() {
  const isMobile = useViewportBreakpoint(860);

  function scrollToHowItWorks() {
    document
      .getElementById('how-it-works')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section id="hero" className="bg-[#0A0D10] px-6 py-20 text-[#E7EDF2] sm:px-10">
      <div
        className={`mx-auto flex max-w-6xl gap-12 ${
          isMobile ? 'flex-col' : 'flex-row items-center'
        }`}
      >
        <div
          className={`flex flex-col gap-6 ${isMobile ? 'w-full' : 'w-1/2'}`}
        >
          <span className="inline-flex w-fit items-center rounded-full border border-[#212930] bg-[#12171C] px-3 py-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide text-[#7FD1FF]">
            {HERO_EYEBROW}
          </span>

          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            {HERO_HEADLINE_PLAIN}
            <span className="text-[#7FD1FF]">{HERO_HEADLINE_ACCENT}</span>
            <br />
            {HERO_HEADLINE_TAIL}
          </h1>

          <p className="max-w-xl text-lg text-[#8B96A1]">{HERO_SUBTEXT}</p>

          <p className="font-[family-name:var(--font-mono)] text-sm text-[#3DDC97]">
            {HERO_STAT}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Link
              href="/login"
              className="rounded-md bg-[#7FD1FF] px-6 py-3 font-semibold text-[#0A0D10] transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7FD1FF]"
            >
              {PRIMARY_CTA_LABEL}
            </Link>
            <button
              type="button"
              onClick={scrollToHowItWorks}
              className="rounded-md border border-[#212930] px-6 py-3 font-semibold text-[#E7EDF2] transition hover:border-[#7FD1FF] hover:text-[#7FD1FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7FD1FF]"
            >
              {SECONDARY_CTA_LABEL}
            </button>
          </div>
        </div>

        <div className={isMobile ? 'w-full' : 'w-1/2'}>
          <ComputeEstimatorPanel />
        </div>
      </div>
    </section>
  );
}
