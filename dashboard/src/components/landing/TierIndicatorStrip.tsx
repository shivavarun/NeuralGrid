import { tierColor, type Tier } from './lib/tierColors';

const TIERS: Tier[] = ['T1', 'T2', 'T3'];

export function TierIndicatorStrip({ activeTier }: { activeTier: Tier }) {
  return (
    <div className="mb-4 flex gap-2">
      {TIERS.map((tier) => {
        const lit = tier === activeTier; // pure equality — Property 2
        return (
          <div
            key={tier}
            className="flex-1 rounded-md border px-2 py-2.5 text-center transition-colors"
            style={
              lit
                ? { borderColor: tierColor(tier), backgroundColor: `${tierColor(tier)}1f` }
                : { borderColor: '#212930' }
            }
          >
            <div
              className="text-[11px] font-semibold"
              style={{ color: lit ? tierColor(tier) : '#5C6670' }}
            >
              {tier}
            </div>
          </div>
        );
      })}
    </div>
  );
}
