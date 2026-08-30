import { RankedInvestmentTable } from './RankedInvestmentTable';
import { BudgetTierCards } from './BudgetTierCards';
import { RolloutTimeline } from './RolloutTimeline';
import { PaybackNotice } from './PaybackNotice';
import { rankedSensorInvestments, budgetTiers, rolloutPath, PAYBACK_STATUS } from '@/investmentMetrics';
import { METRICS } from '@/trustMetrics';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-5 pb-1">
      <span className="h-3 w-0.5 bg-inferred" />
      <h2 className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">{children}</h2>
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

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-line bg-panel" style={{ borderRadius: 0 }}>
            <span className="h-2.5 w-2.5 bg-inferred" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-[0.14em] text-ink-primary">INVESTMENT CASE</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-ink-secondary">
              Sensor additions, ranked by confidence gained per dollar
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5 font-mono text-[10px] tabular-nums text-ink-muted">
          <span>
            validate.csv seeds {METRICS.validationShiftSeeds[0]}-{METRICS.validationShiftSeeds[1]}
          </span>
          <span>ml/artifacts/metrics.json + docs/assumptions.md</span>
        </div>
      </header>

      <SectionLabel>Ranked Table</SectionLabel>
      <section className="px-6 pb-1">
        <div className="min-h-[360px] border border-line bg-panel">
          <RankedInvestmentTable ranked={ranked} />
        </div>
      </section>

      <SectionLabel>Three Budget Levels</SectionLabel>
      <section className="px-6 pb-1">
        <div className="min-h-[220px] border border-line bg-panel">
          <BudgetTierCards tiers={tiers} />
        </div>
      </section>

      <SectionLabel>Rollout Path</SectionLabel>
      <section className="px-6 pb-1">
        <div className="min-h-[260px] border border-line bg-panel">
          <RolloutTimeline steps={steps} />
        </div>
      </section>

      <SectionLabel>Payback</SectionLabel>
      <section className="px-6 pb-6">
        <PaybackNotice status={PAYBACK_STATUS} />
      </section>

      <footer className="flex items-center justify-between border-t border-line-soft px-6 py-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
          stratify · investment case · static report, no live budget control
        </span>
        <span className="font-mono text-[9px] tabular-nums text-ink-muted">{ranked.length} candidate stations</span>
      </footer>
    </div>
  );
}
