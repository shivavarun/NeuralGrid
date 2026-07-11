'use client';

import { AMD_PLATFORM, AMD_MI300X_VRAM, AMD_MI300X_RELEVANCE } from '@/components/content/amdCallout';
import { useViewportBreakpoint } from '@/components/landing/lib/viewportBreakpoint';

export function AmdCalloutSection() {
  const isMobile = useViewportBreakpoint(860);

  return (
    <section id="amd" className="bg-[#0A0D10] px-6 py-20 text-[#E7EDF2]">
      <div className="mx-auto max-w-4xl">
        <span className="mb-6 inline-flex w-fit items-center rounded-full border border-[#7FD1FF]/40 bg-[#12171C] px-3 py-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-widest text-[#7FD1FF]">
          Platform spotlight
        </span>

        <div className={`flex gap-8 ${isMobile ? 'flex-col' : 'flex-row items-center'}`}>
          {/* Distinct VRAM stat container, cyan accent */}
          <div
            className={`rounded-2xl border border-[#7FD1FF]/40 bg-[#12171C] p-8 text-center shadow-[0_0_40px_-12px_rgba(127,209,255,0.5)] ${
              isMobile ? 'w-full' : 'w-1/2'
            }`}
          >
            <p className="mb-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-widest text-[#5C6670]">
              AMD MI300X
            </p>
            <p className="font-[family-name:var(--font-mono)] text-4xl font-bold text-[#7FD1FF] sm:text-5xl">
              {AMD_MI300X_VRAM}
            </p>
            <p className="mt-2 font-[family-name:var(--font-mono)] text-xs text-[#8B96A1]">
              VRAM per accelerator
            </p>
          </div>

          {/* Descriptive copy */}
          <div className={isMobile ? 'w-full' : 'w-1/2'}>
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-4xl">
              Built on AMD
            </h2>
            <p className="mb-4 text-[#8B96A1]">
              NeuralGrid runs exclusively on{' '}
              <span className="text-[#E7EDF2]">{AMD_PLATFORM}</span>.
            </p>
            <p className="text-[#8B96A1]">{AMD_MI300X_RELEVANCE}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
