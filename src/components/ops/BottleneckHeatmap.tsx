import { PanelTitle } from '../PanelTitle';
import type { BottleneckHeatmap as HeatmapData } from '@/opsMetrics';

interface Props {
  heatmap: HeatmapData;
}

/** Opacity steps on a single flat colour, not a gradient fill — each cell
 *  is one solid rect at one of five fixed alpha levels, chosen by which
 *  bucket the real rate falls in. */
function cellClass(rate: number | null): string {
  if (rate === null) return 'bg-panel-inset';
  if (rate === 0) return 'bg-panel-inset';
  if (rate < 0.1) return 'bg-starved/20';
  if (rate < 0.25) return 'bg-starved/40';
  if (rate < 0.5) return 'bg-starved/65';
  return 'bg-starved/90';
}

function cellLabel(rate: number | null): string {
  if (rate === null) return '—';
  if (rate === 0) return '';
  return String(Math.round(rate * 100));
}

/**
 * Recurring-bottleneck rate by station and shift — the fraction of visits
 * at each station, in each simulated shift, whose true cycle time crossed
 * the ALERT_MULTIPLIER threshold. Ground truth, not model confidence.
 * Scope: the 10 blind/partial stations the soft-sensor pipeline already
 * tracks per shift (see src/opsMetrics.ts's doc comment on why the other
 * 32 sensored stations aren't in this matrix).
 */
export function BottleneckHeatmap({ heatmap }: Props) {
  return (
    <div className="flex h-full flex-col">
      <PanelTitle
        title="Recurring Bottleneck Heatmap"
        subtitle={`${heatmap.stationIds.length} stations x ${heatmap.shiftSeeds.length} shifts`}
      />
      <div className="thin-scroll flex-1 overflow-auto p-3">
        <table className="border-collapse font-mono text-[9.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-panel px-2 py-1 text-left text-[8.5px] uppercase tracking-[0.1em] text-ink-muted">
                Station
              </th>
              {heatmap.shiftSeeds.map((seed) => (
                <th key={seed} className="w-8 px-0.5 py-1 text-center text-[7.5px] font-normal text-ink-faint">
                  {String(seed).slice(-2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.stationIds.map((stationId) => (
              <tr key={stationId}>
                <td className="sticky left-0 z-10 bg-panel px-2 py-0.5 font-semibold text-ink-primary">{stationId}</td>
                {heatmap.shiftSeeds.map((seed) => {
                  const rate = heatmap.rate(stationId, seed);
                  return (
                    <td key={seed} className="p-0.5">
                      <div
                        className={`flex h-6 w-7 items-center justify-center ${cellClass(rate)}`}
                        style={{ borderRadius: 0 }}
                      >
                        <span className="text-[7.5px] tabular-nums text-ink-primary/80">{cellLabel(rate)}</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[9px] leading-snug text-ink-muted">
        Cell = % of that station's visits in that simulated shift whose true cycle time exceeded 1.15x nominal.
        Shift columns are the last two digits of each held-out shiftSeed, in order — not calendar days.
      </p>
    </div>
  );
}
