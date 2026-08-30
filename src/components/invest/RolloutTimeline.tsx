import { PanelTitle } from '../PanelTitle';
import type { RolloutStep } from '@/investmentMetrics';
import { MAINTENANCE_WINDOWS_PER_YEAR } from '@/engine/assumptions';

interface Props {
  steps: RolloutStep[];
}

/**
 * Sensor additions batch into scheduled maintenance windows rather than
 * arriving continuously (docs/assumptions.md's instrumentation-cost
 * constraint). One station per window, filling every window of a year
 * before advancing — the simplest schedule that respects the constraint
 * without assuming an install-capacity number the source data doesn't
 * give.
 */
export function RolloutTimeline({ steps }: Props) {
  const years = [...new Set(steps.map((s) => s.year))].sort((a, b) => a - b);
  const byYearWindow = new Map<string, RolloutStep>(steps.map((s) => [`${s.year} ${s.windowInYear}`, s]));

  return (
    <div className="flex h-full flex-col">
      <PanelTitle
        title="Rollout Path"
        subtitle={`${MAINTENANCE_WINDOWS_PER_YEAR} maintenance windows / year, all ${steps.length} stations`}
      />
      <div className="thin-scroll flex-1 overflow-auto p-4">
        <table className="w-full border-collapse font-mono text-[10.5px]">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.1em] text-ink-muted">Year</th>
              {Array.from({ length: MAINTENANCE_WINDOWS_PER_YEAR }, (_, i) => i + 1).map((w) => (
                <th key={w} className="px-2 py-1 text-left text-[9px] uppercase tracking-[0.1em] text-ink-muted">
                  Window {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year} className="border-t border-line-soft">
                <td className="px-2 py-2 text-ink-secondary">Y{year}</td>
                {Array.from({ length: MAINTENANCE_WINDOWS_PER_YEAR }, (_, i) => i + 1).map((w) => {
                  const step = byYearWindow.get(`${year} ${w}`);
                  return (
                    <td key={w} className="px-2 py-2">
                      {step ? (
                        <span
                          className="inline-flex items-center gap-1.5 border border-line bg-panel-raised px-2 py-1"
                          style={{ borderRadius: 0 }}
                        >
                          <span className="font-semibold text-ink-primary">{step.stationId}</span>
                          <span className="text-[9px] text-ink-muted">#{step.rank}</span>
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[9px] leading-snug text-ink-muted">
        #N = rank in the confidence-gain-per-dollar table. 4 windows/year is a stated assumption
        (docs/assumptions.md), not a derived or plant-specific figure.
      </p>
    </div>
  );
}
