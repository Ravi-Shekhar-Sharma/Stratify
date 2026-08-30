import { PanelTitle } from '../PanelTitle';
import type { BudgetTier } from '@/investmentMetrics';

interface Props {
  tiers: BudgetTier[];
}

function usd(x: number): string {
  return `$${Math.round(x).toLocaleString('en-US')}`;
}

/**
 * Three fixed budget levels, not a live slider — each covers a real
 * top-N slice of the ranked table, with cost and aggregate confidence
 * gain summed from the same figures, never a round invented dollar
 * amount.
 */
export function BudgetTierCards({ tiers }: Props) {
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Three Budget Levels" subtitle="fixed, not a live control" />
      <div className="grid flex-1 grid-cols-1 gap-px bg-line-soft p-px sm:grid-cols-3">
        {tiers.map((tier) => (
          <div key={tier.label} className="flex flex-col gap-2 bg-panel p-4">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-primary">{tier.label}</div>
            <div className="font-mono text-[18px] font-bold text-inferred">
              {usd(tier.totalCostLowUsd)}-{usd(tier.totalCostHighUsd)}
            </div>
            <div className="font-mono text-[10.5px] text-ink-secondary">
              +{(tier.totalConfidenceGain * 100).toFixed(1)} pts aggregate confidence gain
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {tier.stationIds.map((id) => (
                <span
                  key={id}
                  className="border border-line-soft bg-panel-inset px-1.5 py-0.5 font-mono text-[9px] text-ink-secondary"
                  style={{ borderRadius: 0 }}
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
