import { CalibrationChart } from './CalibrationChart';
import { AlertPerformancePanel } from './AlertPerformancePanel';
import { FalseAlarmCallout } from './FalseAlarmCallout';
import { TierErrorPanel } from './TierErrorPanel';
import { SensorLiftCallout } from './SensorLiftCallout';
import { TrustLedger } from './TrustLedger';
import { METRICS, sensorLift, buildLedgerRows } from '@/trustMetrics';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-5 pb-1">
      <span className="h-3 w-0.5 bg-cyan" />
      <h2 className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">{children}</h2>
    </div>
  );
}

/**
 * The model trust view: every number on this page is read from
 * ml/artifacts/metrics.json (src/trustMetrics.ts) — the committed,
 * reproducible output of `python ml/validate.py`. Nothing here is
 * recomputed, guessed, or copied from a deck.
 */
export function TrustView() {
  const s6Lift = sensorLift('S6');
  const ledgerRows = buildLedgerRows();

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-line bg-panel" style={{ borderRadius: 0 }}>
            <span className="h-2.5 w-2.5 bg-inferred" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-[0.14em] text-ink-primary">MODEL TRUST</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-ink-secondary">
              Scored against held-out ground truth — no live state
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5 font-mono text-[10px] tabular-nums text-ink-muted">
          <span>
            validate.csv seeds {METRICS.validationShiftSeeds[0]}-{METRICS.validationShiftSeeds[1]} ·{' '}
            {METRICS.validationRows.toLocaleString()} rows
          </span>
          <span>ml/artifacts/metrics.json</span>
        </div>
      </header>

      <section className="px-6 pt-5">
        <FalseAlarmCallout alertBands={METRICS.alertMetricsByBand} deliverable={METRICS.s6S9LeadTime.deliverable} />
      </section>

      <SectionLabel>Calibration &amp; Alerting</SectionLabel>
      <section className="grid gap-px bg-line-soft px-6 pb-1 lg:grid-cols-2">
        <div className="min-h-[420px] border border-line bg-panel">
          <CalibrationChart
            points={METRICS.calibration}
            toleranceSeconds={METRICS.calibrationToleranceSeconds}
            toleranceDerivation={METRICS.calibrationToleranceDerivation}
          />
        </div>
        <div className="min-h-[420px] border border-line bg-panel">
          <AlertPerformancePanel alertBands={METRICS.alertMetricsByBand} leadTime={METRICS.s6S9LeadTime} />
        </div>
      </section>

      <SectionLabel>Error by Observability Tier</SectionLabel>
      <section className="grid gap-px bg-line-soft px-6 pb-1 lg:grid-cols-2">
        <div className="border border-line bg-panel">
          <TierErrorPanel perTier={METRICS.perTier} confidenceCeilings={METRICS.confidenceCeilings} />
        </div>
        <div className="flex flex-col justify-center border border-line bg-panel p-1">
          {s6Lift ? (
            <SensorLiftCallout lift={s6Lift} />
          ) : (
            <span className="p-4 font-mono text-[11px] text-ink-muted">— S6 not present in perStation —</span>
          )}
        </div>
      </section>

      <SectionLabel>Trust Ledger</SectionLabel>
      <section className="px-6 pb-6">
        <div className="h-[420px] border border-line bg-panel">
          <TrustLedger rows={ledgerRows} />
        </div>
      </section>

      <footer className="flex items-center justify-between border-t border-line-soft px-6 py-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
          stratify · model trust · reproducible from a clean checkout
        </span>
        <span className="font-mono text-[9px] tabular-nums text-ink-muted">
          {METRICS.trainRows.toLocaleString()} train rows · {METRICS.validationRows.toLocaleString()} held-out rows
        </span>
      </footer>
    </div>
  );
}
