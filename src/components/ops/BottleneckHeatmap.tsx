import { PanelTitle } from '../PanelTitle';
import { ChartLegend } from '../charts/chartKit';
import type { BottleneckHeatmap as HeatmapData } from '@/opsMetrics';

interface Props {
  heatmap: HeatmapData;
}

const BUCKETS: { max: number; className: string; label: string }[] = [
  { max: 0.1, className: 'bg-starved/20', label: '<10%' },
  { max: 0.25, className: 'bg-starved/40', label: '10-25%' },
  { max: 0.5, className: 'bg-starved/65', label: '25-50%' },
  { max: Infinity, className: 'bg-starved/90', label: '50%+' },
];

/** Opacity steps on a single flat colour, not a gradient fill — each
 *  nonzero cell is one solid rect at one of four fixed alpha levels,
 *  chosen by which bucket the real rate falls in. A rate of exactly 0
 *  never reaches this function - it gets its own "measured zero" tick,
 *  see ZeroCell, so it's never confused with the no-data dash. */
function cellClass(rate: number): string {
  return (BUCKETS.find((b) => rate < b.max) ?? BUCKETS[BUCKETS.length - 1]).className;
}

function cellLabel(rate: number): string {
  return String(Math.round(rate * 100));
}

/** A rate of exactly 0 is a real measurement (that station, that shift,
 *  never crossed the threshold) and must read as deliberately checked, not
 *  as an absence. A small centered tick on the same inset surface as the
 *  matrix background, rather than nothing, is what makes that legible at a
 *  glance without a label on every one of ~150 cells. */
function ZeroCell() {
  return (
    <div className="flex h-9 w-10 items-center justify-center rounded-sm border border-line-soft/60 bg-panel-inset">
      <span className="h-1 w-1 rounded-full bg-ink-faint" aria-hidden />
    </div>
  );
}

function NoDataCell() {
  return (
    <div className="flex h-9 w-10 items-center justify-center rounded-sm">
      <span className="text-[10px] text-ink-faint/60">-</span>
    </div>
  );
}

/**
 * Recurring-bottleneck rate by station and shift — the fraction of visits
 * at each station, in each simulated shift, whose true cycle time crossed
 * the ALERT_MULTIPLIER threshold. Ground truth, not model confidence.
 * Scope: the 10 blind/partial stations the soft-sensor pipeline already
 * tracks per shift (see src/opsMetrics.ts's doc comment on why the other
 * 32 sensored stations aren't in this matrix).
 *
 * Rows are sorted by total recurrence, highest first, so the honest
 * finding — a handful of stations carry most of the recurrence, the rest
 * are close to clean — is the first thing the eye lands on rather than
 * something a reader has to hunt for across a mostly-quiet 10x15 grid. A
 * right-hand leaderboard restates the same ranking as bars, using the wide
 * empty space a fixed-width matrix left unused in a very wide panel, so
 * the panel's real argument (which stations recur) has two reinforcing
 * reads instead of one dense table competing with acres of nothing.
 */
export function BottleneckHeatmap({ heatmap }: Props) {
  const totals = new Map<string, number>(
    heatmap.stationIds.map((id) => [
      id,
      heatmap.shiftSeeds.reduce((sum, seed) => sum + (heatmap.rate(id, seed) ?? 0), 0),
    ]),
  );
  const sortedIds = [...heatmap.stationIds].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  const maxTotal = Math.max(0.01, ...sortedIds.map((id) => totals.get(id) ?? 0));

  return (
    <div className="flex h-full flex-col">
      <PanelTitle
        title="Recurring Bottleneck Heatmap"
        subtitle={`${heatmap.stationIds.length} stations x ${heatmap.shiftSeeds.length} shifts, sorted by recurrence`}
      />
      <div className="flex flex-1 flex-col gap-6 overflow-hidden p-4 lg:flex-row">
        <div className="thin-scroll flex flex-1 flex-col overflow-auto lg:min-w-0">
          {/* self-center: this div is a flex-col container, whose default
              cross-axis behaviour (align-items: stretch) was silently
              stretching the table's own outer box to the container's full
              width even though table-layout:auto never grew the columns
              to match - the result was an invisible dead zone between the
              matrix's real content and the leaderboard, reported as
              "needs centering." self-center opts just the table out of
              stretch so it sizes to its own content and centers, without
              touching the legend row below it (which still wants its own
              full-width border-t). */}
          <table className="self-center border-collapse font-mono text-[11px]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-10 bg-panel px-2 py-1.5 text-left text-[10.5px] uppercase tracking-[0.1em] text-ink-muted">
                  Station
                </th>
                {heatmap.shiftSeeds.map((seed) => (
                  <th key={seed} className="sticky top-0 z-[5] w-10 bg-panel px-0.5 py-1.5 text-center text-[10px] font-normal text-ink-faint">
                    {String(seed).slice(-2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedIds.map((stationId) => (
                <tr key={stationId}>
                  <td className="sticky left-0 z-10 bg-panel px-2 py-0.5 font-semibold text-ink-primary">{stationId}</td>
                  {heatmap.shiftSeeds.map((seed) => {
                    const rate = heatmap.rate(stationId, seed);
                    return (
                      <td key={seed} className="p-0.5">
                        {rate === null ? (
                          <NoDataCell />
                        ) : rate === 0 ? (
                          <ZeroCell />
                        ) : (
                          <div className={`flex h-9 w-10 items-center justify-center rounded-sm ${cellClass(rate)}`}>
                            <span className="text-[11px] font-semibold tabular-nums text-ink-primary/85">{cellLabel(rate)}</span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 border-t border-line-soft pt-2.5">
            <ChartLegend
              items={[
                { swatch: <ZeroCell />, label: '0, measured' },
                ...BUCKETS.map((b) => ({ swatch: <span className={`inline-block h-4 w-5 rounded-sm ${b.className}`} />, label: b.label })),
                { swatch: <NoDataCell />, label: 'no data' },
              ]}
            />
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 border-t border-line-soft pt-4 lg:w-[260px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">
            Recurrence leaderboard
          </span>
          <div className="flex flex-col gap-2">
            {sortedIds.map((stationId) => {
              const total = totals.get(stationId) ?? 0;
              const nonzeroShifts = heatmap.shiftSeeds.filter((seed) => (heatmap.rate(stationId, seed) ?? 0) > 0).length;
              return (
                <div key={stationId} className="flex items-center gap-2.5">
                  <span className="w-8 shrink-0 font-mono text-[11px] font-semibold text-ink-primary">{stationId}</span>
                  <div className="h-2.5 flex-1 bg-panel-inset">
                    <div
                      className="h-full bg-starved/70"
                      style={{ width: total > 0 ? `${Math.max(4, (total / maxTotal) * 100)}%` : '0%' }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-ink-muted">
                    {nonzeroShifts}/{heatmap.shiftSeeds.length} shifts
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[15px] leading-[1.55] text-white/62">
        Each cell is the share of that station's visits in that simulated shift whose true cycle time exceeded
        1.15x nominal - a rate of 0 is a real measurement, not a missing one. Shift columns are the last two digits
        of each held-out shift seed, in order - not calendar days.
      </p>
    </div>
  );
}
