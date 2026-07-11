'use client';

import { PRICING_TIERS } from '@/components/content/pricingTiers';
import { tierColor } from './lib/tierColors';
import { useViewportBreakpoint } from './lib/viewportBreakpoint';

export function PricingSection() {
  const single = useViewportBreakpoint(860);

  return (
    <section id="pricing" className="bg-[#0A0D10] px-6 py-20 text-white">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-4 text-3xl font-bold sm:text-4xl">GPU tiers and pricing</h2>
        <p className="mb-10 max-w-2xl text-[#8B96A1]">
          Every job is automatically matched to one of three tiers based on what it actually needs.
        </p>

        <div
          className="grid gap-6"
          style={{ gridTemplateColumns: single ? '1fr' : 'repeat(3, 1fr)' }}
        >
          {PRICING_TIERS.map((row) => {
            const accent = tierColor(row.tier);
            return (
              <div
                key={row.tier}
                className="rounded-xl border bg-[#12171C] p-6"
                style={{ borderColor: accent, backgroundColor: `${accent}14` }}
              >
                <div
                  className="mb-4 text-sm font-semibold uppercase tracking-wider"
                  style={{ color: accent }}
                >
                  {row.tier} — {row.label}
                </div>

                <dl className="space-y-3 font-[family-name:var(--font-mono)] text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-[#8B96A1]">VRAM range</dt>
                    <dd className="text-white">{row.vramRange}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-[#8B96A1]">Hardware</dt>
                    <dd className="text-white">{row.hardware}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-[#8B96A1]">Price range</dt>
                    <dd className="text-lg font-semibold" style={{ color: accent }}>
                      {row.priceRange}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wider text-[#8B96A1]">
                      Example workload
                    </dt>
                    <dd className="text-white">{row.exampleWorkload}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
