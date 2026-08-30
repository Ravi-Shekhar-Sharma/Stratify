import { PanelTitle } from '../PanelTitle';
import type { AlertMetricsByBand, S6S9LeadTime, SeverityBand } from '@/trustMetrics';

interface Props {
  alertBands: AlertMetricsByBand;
  leadTime: S6S9LeadTime;
}

function fmtSeconds(s: number | null): string {
  if (s === null) return '—';
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = Math.round(abs % 60);
  return m > 0 ? `${sign}${m}m ${sec}s` : `${sign}${sec}s`;
}

function pct(x: number | null): string {
  return x === null ? '—' : `${(x * 100).toFixed(1)}%`;
}

const BAND_LABEL: Record<SeverityBand, string> = { easy: 'Easy (1.3-2.0x nominal)', marginal: 'Marginal (1.10-1.25x nominal)' };

export function AlertPerformancePanel({ alertBands, leadTime }: Props) {
  const bands: SeverityBand[] = ['easy', 'marginal'];

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Bottleneck Alert Performance" subtitle={`ALERT_MIN_HOLD=${alertBands.alertMinHold} · ${alertBands.alertMultiplier}x nominal`} />
      <div className="grid flex-1 grid-cols-1 gap-px overflow-y-auto bg-line-soft md:grid-cols-2">
        {bands.map((band) => {
          const a = alertBands[band];
          const deliverable = leadTime.deliverable.byBand[band];
          const headroom = leadTime.physicalHeadroom.byBand[band];
          const dLt = deliverable.leadTimeConditionedOnCausalWarning;
          const hLt = headroom.leadTimeConditionedOnCausalWarning;
          const fireRateLow = (deliverable.warningFireRate ?? 1) < 0.9;

          return (
            <div key={band} className="flex flex-col gap-3 bg-panel px-4 py-3.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary">{BAND_LABEL[band]}</span>

              <div className="grid grid-cols-2 gap-2">
                <Stat label="Precision" value={pct(a.precision)} />
                <Stat label="Recall" value={pct(a.recall)} />
              </div>

              <div className="border border-cyan/30 bg-cyan/5 px-3 py-2.5" style={{ borderRadius: 0 }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-inferred">Deliverable lead time</span>
                  <span className="font-mono text-[9px] text-ink-muted">n={dLt.n}</span>
                </div>
                <div className="mt-1 font-mono text-[22px] font-bold tabular-nums text-ink-primary">
                  {fmtSeconds(dLt.medianSeconds)}
                  <span className="ml-1.5 text-[11px] font-normal text-ink-secondary">median</span>
                </div>
                <div className="font-mono text-[10px] tabular-nums text-ink-secondary">
                  range [{fmtSeconds(dLt.minSeconds)}, {fmtSeconds(dLt.maxSeconds)}]
                </div>
                <div className={`mt-1.5 font-mono text-[10px] tabular-nums ${fireRateLow ? 'text-slowing' : 'text-ink-secondary'}`}>
                  fires on {pct(deliverable.warningFireRate)} of {deliverable.totalIncidentRuns} incidents
                  {deliverable.runsAlertNeverFired > 0 && ` (${deliverable.runsAlertNeverFired} never fired)`}
                </div>
              </div>

              <div className="border border-line-soft px-3 py-2" style={{ borderRadius: 0 }}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[8.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                    Physical headroom — NOT achievable live
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-ink-secondary">
                  {fmtSeconds(hLt.medianSeconds)}
                  <span className="ml-1.5 text-[9px] font-normal text-ink-muted">median · range [{fmtSeconds(hLt.minSeconds)}, {fmtSeconds(hLt.maxSeconds)}]</span>
                </div>
                <p className="mt-1 text-[9px] leading-snug text-ink-muted">
                  Undebounced, at first crossing — a physics upper bound the live product cannot reach.
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[9.5px] leading-snug text-ink-muted">
        Deliverable = availableTick (prediction actually computable) + the unified debounced alert
        (src/engine/inference/alertSignal.ts) — the same signal the live tile commits on. Never the
        physical-headroom figure.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel-raised px-2.5 py-2" style={{ borderRadius: 0 }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">{label}</div>
      <div className="font-mono text-[17px] font-bold tabular-nums text-ink-primary">{value}</div>
    </div>
  );
}
