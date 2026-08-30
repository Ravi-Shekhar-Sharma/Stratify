import type { AlertMetricsByBand, LeadTimeBundle } from '@/trustMetrics';

interface Props {
  alertBands: AlertMetricsByBand;
  deliverable: LeadTimeBundle;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

/**
 * Stated prominently on purpose — the Accenture brief warns that false
 * alarms erode floor trust, so this is the one number this whole page
 * puts first, not last. Both bands share the same FAR by construction
 * (both are scored against the identical steady-state rows — see
 * alertMetricsByBand.falseAlarmRateDefinition), so one real number, not
 * a pair invented to look thorough.
 */
export function FalseAlarmCallout({ alertBands, deliverable }: Props) {
  const far = alertBands.easy.falseAlarmRate;
  const marginalMissRate = 1 - (deliverable.byBand.marginal.warningFireRate ?? 1);

  return (
    <div className="flex flex-col gap-4 border border-line bg-panel px-6 py-5 sm:flex-row sm:items-center" style={{ borderRadius: 0 }}>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[40px] font-bold leading-none tabular-nums text-measured">{pct(far)}</span>
        <div className="flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-primary">False Alarm Rate</span>
          <span className="text-[10.5px] text-ink-secondary">{alertBands.falseAlarmRateDefinition}</span>
        </div>
      </div>

      <div className="hidden h-10 w-px bg-line sm:block" />

      <p className="text-[12.5px] leading-snug text-ink-secondary">
        Shown openly, not buried in a table — a low false-alarm rate is only half the honesty this
        product sells. The other half: on the <span className="font-mono text-ink-primary">marginal</span> severity
        band, <span className="font-mono font-semibold text-slowing">{pct(marginalMissRate)}</span> of incidents
        currently produce <span className="font-semibold text-ink-primary">no deliverable warning at all</span> — a
        real recall cost of requiring a debounced, physically-available alert rather than a single noisy
        crossing.
      </p>
    </div>
  );
}
