import { CoverageMap } from './CoverageMap';
import { BottleneckHeatmap } from './BottleneckHeatmap';
import { ShiftVariationPanel } from './ShiftVariationPanel';
import { AvailabilityOeeTable } from './AvailabilityOeeTable';
import { coverageByShop, bottleneckHeatmap, shiftVariationByStation, stationAvailabilityOee } from '@/opsMetrics';
import { METRICS } from '@/trustMetrics';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-5 pb-1">
      <span className="h-3 w-0.5 bg-slowing" />
      <h2 className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">{children}</h2>
    </div>
  );
}

/**
 * Plant-manager weekly-horizon report: static, read-only, no controls.
 * Every number reads from src/engine/stations.ts (topology) or
 * ml/artifacts/metrics.json via src/opsMetrics.ts — nothing is entered or
 * simulated live. Deliberately simpler than the floor Twin view: four flat
 * sections, no animation beyond what the design system permits (there is
 * no live state here to animate against).
 */
export function OpsView() {
  const shops = coverageByShop();
  const heatmap = bottleneckHeatmap();
  const variation = shiftVariationByStation();
  const availability = stationAvailabilityOee();

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-line bg-panel" style={{ borderRadius: 0 }}>
            <span className="h-2.5 w-2.5 bg-slowing" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-[0.14em] text-ink-primary">PLANT MANAGER</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-ink-secondary">
              Weekly horizon · read-only report
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5 font-mono text-[10px] tabular-nums text-ink-muted">
          <span>
            validate.csv seeds {METRICS.validationShiftSeeds[0]}-{METRICS.validationShiftSeeds[1]}
          </span>
          <span>ml/artifacts/metrics.json + src/engine/stations.ts</span>
        </div>
      </header>

      <SectionLabel>Coverage</SectionLabel>
      <section className="px-6 pb-1">
        <div className="min-h-[280px] border border-line bg-panel">
          <CoverageMap shops={shops} />
        </div>
      </section>

      <SectionLabel>Recurring Bottlenecks</SectionLabel>
      <section className="px-6 pb-1">
        <div className="min-h-[360px] border border-line bg-panel">
          <BottleneckHeatmap heatmap={heatmap} />
        </div>
      </section>

      <SectionLabel>Shift Variation</SectionLabel>
      <section className="px-6 pb-1">
        <div className="min-h-[300px] border border-line bg-panel">
          <ShiftVariationPanel variation={variation} />
        </div>
      </section>

      <SectionLabel>Availability &amp; OEE</SectionLabel>
      <section className="px-6 pb-6">
        <div className="min-h-[300px] border border-line bg-panel">
          <AvailabilityOeeTable rows={availability} />
        </div>
      </section>

      <footer className="flex items-center justify-between border-t border-line-soft px-6 py-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
          stratify · plant manager · static report, no controls
        </span>
        <span className="font-mono text-[9px] tabular-nums text-ink-muted">
          {heatmap.stationIds.length} tracked stations · {heatmap.shiftSeeds.length} shifts
        </span>
      </footer>
    </div>
  );
}
