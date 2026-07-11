import { COMPETITORS, NEURALGRID_ROW } from '@/components/content/competitors';
import { routingIndicator } from './lib/comparisonIndicator';

const ROWS = [NEURALGRID_ROW, ...COMPETITORS];

export function ComparisonSection() {
  return (
    <section id="comparison" className="bg-ng-section-gradient px-6 py-20 text-white">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-4 text-3xl font-bold sm:text-4xl">How NeuralGrid compares</h2>
        <p className="mb-10 max-w-2xl text-gray-300">
          None of the existing GPU marketplaces automatically route jobs to the cheapest sufficient tier.
        </p>

        <div className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
          <table className="w-full min-w-[480px] border-collapse text-left font-[family-name:var(--font-mono)]">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-400">
                <th className="py-3 pr-4 font-semibold">Platform</th>
                <th className="py-3 font-semibold">Automatic tier routing</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const isNeuralGrid = row.name === NEURALGRID_ROW.name;
                return (
                  <tr
                    key={row.name}
                    className={
                      isNeuralGrid
                        ? 'border border-ng-accent-cyan/40 bg-ng-accent-cyan/10 font-semibold text-ng-accent-cyan'
                        : 'border-b border-white/5 text-gray-200'
                    }
                  >
                    <td className="py-3 pr-4">{row.name}</td>
                    <td
                      className={`py-3 ${
                        row.autoTierRouting ? 'text-ng-tier-1' : 'text-ng-tier-3'
                      }`}
                    >
                      {routingIndicator(row.autoTierRouting)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
