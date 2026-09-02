import { CoverageMap } from './CoverageMap';
import { BottleneckHeatmap } from './BottleneckHeatmap';
import { ShiftVariationPanel } from './ShiftVariationPanel';
import { AvailabilityOeeTable } from './AvailabilityOeeTable';
import { Panel } from '../Panel';
import { Reveal } from '../Reveal';
import { ViewHero } from '../ViewHero';
import { ProvenanceStrip } from '../ProvenanceStrip';
import { ChapterNav } from '../ChapterNav';
import type { View } from '../TopNav';
import {
  coverageByShop,
  bottleneckHeatmap,
  shiftVariationByStation,
  stationAvailabilityOee,
  recurringBottleneckCount,
  meanPlantOee,
} from '@/opsMetrics';
import { STATIONS } from '@/engine/stations';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-10 pb-3 sm:px-8">
      <span className="h-3 w-0.5 bg-slowing" />
      <h2 className="font-mono text-caption font-bold uppercase tracking-[0.18em] text-ink-secondary">{children}</h2>
    </div>
  );
}

/**
 * Plant-manager weekly-horizon report: static, read-only, no controls.
 * Every number reads from src/engine/stations.ts (topology) or
 * ml/artifacts/metrics.json via src/opsMetrics.ts — nothing is entered or
 * simulated live.
 */
export function OpsView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const shops = coverageByShop();
  const heatmap = bottleneckHeatmap();
  const variation = shiftVariationByStation();
  const availability = stationAvailabilityOee();
  const recurring = recurringBottleneckCount();
  const oee = meanPlantOee();
  const blindPartial = STATIONS.filter((s) => s.tier !== 'sensored').length;

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <div className="relative z-10">
      <ViewHero
        eyebrow="Plant Manager"
        headline="The same bottlenecks recur. This second's value doesn't show you that."
        subtitle="A live dashboard shows one instant. This report is the pattern across held-out shifts - which stations actually cost you, again and again, not just once."
        proofs={[
          {
            value: recurring.count,
            suffix: `of ${recurring.total}`,
            label: 'Tracked stations bottleneck more than once',
            tone: 'text-starved',
          },
          { value: oee * 100, decimals: 1, suffix: '%', label: 'Mean OEE, availability x performance', tone: 'text-measured' },
          {
            value: blindPartial,
            suffix: `of ${STATIONS.length}`,
            label: 'Stations still dark to conventional systems',
            tone: 'text-cyan',
          },
        ]}
      />

      <SectionLabel>Coverage</SectionLabel>
      <Reveal className="px-6 pb-3 sm:px-8">
        <Panel elevation="raised" className="min-h-[460px]">
          <CoverageMap shops={shops} />
        </Panel>
      </Reveal>

      <SectionLabel>Recurring Bottlenecks</SectionLabel>
      <Reveal className="px-6 pb-3 sm:px-8">
        <Panel elevation="raised" className="min-h-[560px]">
          <BottleneckHeatmap heatmap={heatmap} />
        </Panel>
      </Reveal>

      <SectionLabel>Shift Variation</SectionLabel>
      <Reveal className="px-6 pb-3 sm:px-8">
        <Panel className="min-h-[440px]">
          <ShiftVariationPanel variation={variation} />
        </Panel>
      </Reveal>

      <SectionLabel>Availability &amp; OEE</SectionLabel>
      <Reveal className="px-6 pb-10 sm:px-8">
        <Panel className="min-h-[340px]">
          <AvailabilityOeeTable rows={availability} />
        </Panel>
      </Reveal>

      <footer className="border-t border-line-soft px-6 py-5 sm:px-8">
        <ProvenanceStrip bare>
          {heatmap.stationIds.length} tracked stations · {heatmap.shiftSeeds.length} shifts
        </ProvenanceStrip>
      </footer>
      <ChapterNav targetView="invest" targetLabel="Invest" description="what to spend next" onNavigate={onNavigate} />
      </div>
    </div>
  );
}
