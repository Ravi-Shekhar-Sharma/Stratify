import { motion } from 'motion/react';
import { PanelTitle } from '../PanelTitle';
import { STAGGER_CONTAINER, STAGGER_ITEM } from '@/motion';
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
 *
 * Rebuilt (design round 3, item 12) as a real horizontal schedule rail
 * rather than a plain grid of chips: a continuous connecting line runs
 * behind every window in sequence, year groups sit as visually distinct
 * clusters along it, and an unfilled window (a year with fewer than
 * MAINTENANCE_WINDOWS_PER_YEAR stations left to schedule) still renders
 * as an empty slot on the rail so the plan's actual shape - three years,
 * tapering off - is legible as one continuous sequence.
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
      <div className="border-b border-line-soft bg-panel-inset/60 px-5 py-3">
        <span className="font-mono text-[12.5px] leading-[1.5] text-ink-secondary">
          A proposed install order, not a live schedule: stations go in one per maintenance window, in rank order,
          filling each year's {MAINTENANCE_WINDOWS_PER_YEAR} windows before rolling into the next year.
        </span>
      </div>
      <div className="thin-scroll flex-1 overflow-auto p-5">
        <motion.div className="flex items-start gap-6" variants={STAGGER_CONTAINER} initial="initial" animate="animate">
          {years.map((year) => (
            <div key={year} className="flex flex-col gap-2.5">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-secondary">
                Year {year}
              </span>
              <div className="relative flex items-center gap-2.5 rounded border border-line-soft bg-panel-inset/40 px-3 py-3">
                {/* the schedule rail: one continuous line behind every window in this year */}
                <div className="pointer-events-none absolute left-3 right-3 top-1/2 h-px -translate-y-1/2 bg-line-soft" aria-hidden />
                {Array.from({ length: MAINTENANCE_WINDOWS_PER_YEAR }, (_, i) => i + 1).map((w) => {
                  const step = byYearWindow.get(`${year} ${w}`);
                  return (
                    <motion.div key={w} variants={STAGGER_ITEM} className="relative flex flex-col items-center gap-1">
                      <span className="font-mono text-[9.5px] uppercase tracking-wide text-ink-faint">W{w}</span>
                      {step ? (
                        <div className="flex min-w-[58px] flex-col items-center gap-0.5 rounded border border-inferred/40 bg-inferred/10 px-2.5 py-2 shadow-panel">
                          <span className="font-mono text-[13px] font-bold text-ink-primary">{step.stationId}</span>
                          <span className="font-mono text-[10px] text-ink-muted">#{step.rank}</span>
                        </div>
                      ) : (
                        <div className="flex min-w-[58px] flex-col items-center justify-center rounded border border-dashed border-line-soft px-2.5 py-2">
                          <span className="font-mono text-[11px] text-ink-faint">-</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
      <div className="px-4 pb-3">
        <p className="text-[15px] leading-[1.55] text-white/72">
          #N ranks stations by confidence gained per dollar spent. {MAINTENANCE_WINDOWS_PER_YEAR}{' '}
          windows/year is a stated assumption, not a derived or plant-specific figure.
        </p>
      </div>
    </div>
  );
}
