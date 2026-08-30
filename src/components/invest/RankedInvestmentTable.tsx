import { PanelTitle } from '../PanelTitle';
import { STATIONS_BY_ID } from '@/engine/stations';
import type { SensorInvestment } from '@/investmentMetrics';

interface Props {
  ranked: SensorInvestment[];
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function usd(x: number): string {
  return `$${Math.round(x).toLocaleString('en-US')}`;
}

/**
 * Every non-sensored station, ranked by confidence gained per dollar of
 * plant-deployable instrumentation spend. The cost range is identical for
 * every row — docs/assumptions.md gives one order-of-magnitude range for
 * instrumentation, not a per-station figure — so the ranking is really
 * ranking by confidence gain alone, and the table says so rather than
 * implying a per-station cost difference that doesn't exist in the data.
 */
export function RankedInvestmentTable({ ranked }: Props) {
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Ranked Sensor Additions" subtitle={`${ranked.length} candidate stations`} />
      <div className="thin-scroll flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[10.5px]">
          <thead className="sticky top-0 bg-panel-raised">
            <tr className="text-left text-ink-secondary">
              <th className="border-b border-line px-3 py-2 text-right text-[9px] font-bold uppercase tracking-[0.1em]">
                Rank
              </th>
              <th className="border-b border-line px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em]">
                Station
              </th>
              <th className="border-b border-line px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em]">Tier</th>
              <th className="border-b border-line px-3 py-2 text-right text-[9px] font-bold uppercase tracking-[0.1em]">
                Current confidence
              </th>
              <th className="border-b border-line px-3 py-2 text-right text-[9px] font-bold uppercase tracking-[0.1em]">
                Gain to sensored
              </th>
              <th className="border-b border-line px-3 py-2 text-right text-[9px] font-bold uppercase tracking-[0.1em]">
                Cost (plant-deployable)
              </th>
              <th className="border-b border-line px-3 py-2 text-right text-[9px] font-bold uppercase tracking-[0.1em]">
                Gain / $1,000
              </th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr key={r.stationId} className="border-t border-line-soft">
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">{r.rank}</td>
                <td className="px-3 py-1.5 font-semibold text-ink-primary">
                  {r.stationId} <span className="font-sans font-normal text-ink-secondary">{STATIONS_BY_ID[r.stationId]?.name}</span>
                </td>
                <td className="px-3 py-1.5 text-ink-secondary">{r.tier}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-primary">{pct(r.currentMeanConfidence)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-inferred">+{pct(r.confidenceGain)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-ink-secondary">
                  {usd(r.costLowUsd)}-{usd(r.costHighUsd)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-ink-primary">
                  {r.gainPerThousandUsd.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[9px] leading-snug text-ink-muted">
        Cost range is docs/assumptions.md's single plant-deployable instrumentation figure (2,000-4,500 USD per
        station, pending verification) — identical for every row, so ranking is driven entirely by confidence gain.
      </p>
    </div>
  );
}
