'use client';

import { useViewportBreakpoint } from './lib/viewportBreakpoint';

const STEPS = [
  { title: 'Submit your job', description: 'Send a prompt, image, or audio job through one API call.' },
  { title: 'Compute Estimator classifies it', description: 'VRAM and tier requirements are calculated automatically.' },
  { title: 'Tier is selected', description: 'The cheapest GPU tier that can handle the job is chosen.' },
  { title: 'Routed to a GPU provider', description: 'Your job runs on the matched node and returns a result.' },
];

export function HowItWorksSection() {
  const isMobile = useViewportBreakpoint(860);

  return (
    <section id="how-it-works" className="bg-[#0A0D10] px-6 py-20 text-[#E7EDF2]">
      <div className="mx-auto max-w-4xl">
        <p className="mb-3 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-[#7FD1FF]">
          How it works
        </p>
        <h2 className="mb-10 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-4xl">
          One API call, cheapest matching GPU
        </h2>

        <ol className="flex flex-col gap-10 sm:flex-row sm:gap-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative flex-1">
              {!isMobile && index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  data-testid="step-connector"
                  className="absolute left-10 top-5 hidden h-0 w-[calc(100%-2.5rem)] border-t border-dashed border-[#2A333C] sm:block"
                />
              )}
              <div className="relative mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[#7FD1FF]/40 bg-[#12171C] font-[family-name:var(--font-mono)] font-bold text-[#7FD1FF]">
                {index + 1}
              </div>
              <h3 className="mb-2 font-[family-name:var(--font-display)] font-semibold text-[#E7EDF2]">
                {step.title}
              </h3>
              <p className="text-sm text-[#8B96A1]">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
