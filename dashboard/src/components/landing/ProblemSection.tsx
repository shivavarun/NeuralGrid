import { WASTE_FACTORS } from '@/components/content/wasteFactors';
import { parseTierLabel } from './lib/tierBadge';
import { TierBadge } from './TierBadge';

function TierCell({ label }: { label: string }) {
  const parsed = parseTierLabel(label);
  if (parsed.tier === null) {
    return <span className="text-[#8B96A1]">{parsed.remainder}</span>;
  }
  return <TierBadge tier={parsed.tier}>{parsed.remainder}</TierBadge>;
}

export function ProblemSection() {
  return (
    <section id="problem" className="bg-[#0A0D10] px-6 py-20 text-[#E7EDF2]">
      <div className="mx-auto max-w-4xl">
        <p className="mb-3 font-[family-name:var(--font-mono)] text-xs uppercase tracking-widest text-[#7FD1FF]">
          The problem
        </p>
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-4xl">
          You&apos;re overpaying for GPU compute
        </h2>
        <p className="mb-10 max-w-2xl text-[#8B96A1]">
          Most teams default to the biggest GPU available. Here&apos;s what that actually costs.
        </p>

        <div className="overflow-x-auto rounded-xl border border-[#212930] bg-[#12171C]">
          <table className="min-w-full border-collapse text-left font-[family-name:var(--font-mono)] text-sm">
            <thead>
              <tr className="border-b border-[#1A2026] text-[11px] uppercase tracking-wide text-[#5C6670]">
                <th className="px-4 py-3">Task</th>
                <th className="px-4 py-3">Tier needed</th>
                <th className="px-4 py-3">Tier typically used</th>
                <th className="px-4 py-3">Waste factor</th>
              </tr>
            </thead>
            <tbody>
              {WASTE_FACTORS.map((row) => (
                <tr key={row.taskType} className="border-b border-[#1A2026] last:border-b-0">
                  <td className="px-4 py-3 text-[#E7EDF2]">{row.taskType}</td>
                  <td className="px-4 py-3">
                    <TierCell label={row.tierNeeded} />
                  </td>
                  <td className="px-4 py-3">
                    <TierCell label={row.tierTypicallyUsed} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#7FD1FF]">{row.wasteFactor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
