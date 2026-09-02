import { RankedInvestmentTable } from './RankedInvestmentTable';
import { BudgetTierCards } from './BudgetTierCards';
import { RolloutTimeline } from './RolloutTimeline';
import { Panel } from '../Panel';
import { Reveal } from '../Reveal';
import { ViewHero } from '../ViewHero';
import { ProvenanceStrip } from '../ProvenanceStrip';
import { rankedSensorInvestments, budgetTiers, rolloutPath } from '@/investmentMetrics';
import { MAINTENANCE_WINDOWS_PER_YEAR } from '@/engine/assumptions';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-10 pb-3 sm:px-8">
      <span className="h-3 w-0.5 bg-inferred" />
      <h2 className="font-mono text-caption font-bold uppercase tracking-[0.18em] text-ink-secondary">{children}</h2>
    </div>
  );
}

/**
 * Leadership investment case: static, read-only, no live budget control.
 * Every number reads from ml/artifacts/metrics.json and
 * src/engine/assumptions.ts via src/investmentMetrics.ts.
 */
export function InvestmentView() {
  const ranked = rankedSensorInvestments();
  const tiers = budgetTiers();
  const allStationIds = ranked.map((r) => r.stationId);
  const steps = rolloutPath(allStationIds);
  const top = ranked[0];

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <div className="relative z-10">
      <ViewHero
        eyebrow="Investment Case"
        headline="Instrumentation budget follows confidence gained per dollar - and lands a few windows a year."
        subtitle="Every station on this page is ranked the same way: how much confidence one more sensor buys, per dollar spent, scheduled into the maintenance windows the plant actually has."
        proofs={
          top
            ? [
                { value: top.costMidUsd, suffix: ' usd', label: `Cost to instrument ${top.stationId}, the top-ranked station`, tone: 'text-cyan' },
                { value: top.confidenceGain * 100, decimals: 1, suffix: ' pts', label: 'Confidence gained by that spend', tone: 'text-measured' },
                { value: MAINTENANCE_WINDOWS_PER_YEAR, suffix: '/ year', label: 'Maintenance windows available to install in', tone: 'text-starved' },
              ]
            : [
                { value: 0, label: 'No candidate stations', tone: 'text-ink-muted' },
                { value: 0, label: 'No candidate stations', tone: 'text-ink-muted' },
                { value: MAINTENANCE_WINDOWS_PER_YEAR, suffix: '/ year', label: 'Maintenance windows available to install in', tone: 'text-starved' },
              ]
        }
      />

      <SectionLabel>Ranked by Gain</SectionLabel>
      <Reveal className="px-6 pb-3 sm:px-8">
        <Panel elevation="raised" className="min-h-[560px]">
          <RankedInvestmentTable ranked={ranked} />
        </Panel>
      </Reveal>

      <SectionLabel>Three Budget Levels</SectionLabel>
      <Reveal className="px-6 pb-3 sm:px-8">
        <Panel className="min-h-[560px]">
          <BudgetTierCards tiers={tiers} />
        </Panel>
      </Reveal>

      <SectionLabel>Rollout Path</SectionLabel>
      <Reveal className="px-6 pb-10 sm:px-8">
        <Panel className="min-h-[320px]">
          <RolloutTimeline steps={steps} />
        </Panel>
      </Reveal>

      <footer className="border-t border-line-soft px-6 py-5 sm:px-8">
        <p className="text-[15px] leading-[1.55] text-white/72">
          We do not claim a payback period: it needs a verified downtime-cost or cost-of-poor-quality figure, and
          neither is verified yet. Ranking above is based on confidence gained per unit spend instead.
        </p>
        <ProvenanceStrip>{ranked.length} candidate stations</ProvenanceStrip>
      </footer>
      </div>
    </div>
  );
}
