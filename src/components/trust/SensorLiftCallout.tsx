import type { SensorLift } from '@/trustMetrics';

interface Props {
  lift: SensorLift;
}

function pts(x: number): string {
  return `+${(x * 100).toFixed(1)} pts`;
}

/**
 * Replaces the old demo-incident narrative figure (confidence "0.86 -> 0.97"
 * for an S6 sensor upgrade) — that pair was never measured on either side.
 * This is one real number (S6's empirical mean calibrated confidence,
 * validate.csv, all visits pooled) compared honestly against the two
 * DECLARED ceilings from docs/assumptions.md's Observability tiers table.
 * The ceilings are not empirical measurements — sensored stations never
 * run through the soft sensor — and the copy says so rather than implying
 * a matched before/after pair.
 */
export function SensorLiftCallout({ lift }: Props) {
  return (
    <div className="flex flex-col gap-3.5 px-5 py-4">
      <span className="text-caption font-bold uppercase tracking-[0.16em] text-ink-primary">
        {lift.stationId} instrumentation lift - what full sensoring would buy
      </span>
      <div className="flex flex-wrap items-stretch gap-3">
        <LiftStep
          label="Current"
          value={`${(lift.currentMeanConfidence * 100).toFixed(1)}%`}
          sub={`empirical mean confidence, n=${lift.n.toLocaleString()} validate-set visits`}
          tone="current"
        />
        <Arrow />
        <LiftStep
          label={`Ceiling at current (${lift.tier}) tier`}
          value={lift.tierCeiling !== null ? `${(lift.tierCeiling * 100).toFixed(0)}%` : '-'}
          sub={lift.liftToTierCeiling !== null ? pts(lift.liftToTierCeiling) : ''}
          tone="ceiling"
        />
        <Arrow />
        <LiftStep
          label="If fully sensored"
          value={`${(lift.sensoredCeiling * 100).toFixed(0)}%`}
          sub={pts(lift.liftToSensoredCeiling)}
          tone="ceiling"
        />
      </div>
      <div>
        <p className="text-[15px] leading-[1.55] text-white/72">
          "Current" is empirically measured. Both ceilings are declared maxima, not separately measured
          outcomes: blind and partial share the same 90% ceiling in the trained artifact, and 99% for
          sensored has no empirical confidence distribution behind it here, since a sensored station reports
          ground truth directly and never runs through the soft sensor.
        </p>
      </div>
    </div>
  );
}

function Arrow() {
  return <span className="flex items-center font-mono text-[16px] text-ink-muted">→</span>;
}

function LiftStep({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'current' | 'ceiling' }) {
  return (
    <div
      className={`flex min-w-[150px] flex-1 flex-col gap-1.5 rounded border px-4 py-3.5 shadow-panel ${
        tone === 'current' ? 'border-slowing/40 bg-slowing/5' : 'border-inferred/40 bg-inferred/5'
      }`}
    >
      <span className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-secondary">{label}</span>
      <span className={`font-mono text-[24px] font-bold tabular-nums ${tone === 'current' ? 'text-slowing' : 'text-inferred'}`}>
        {value}
      </span>
      <span className="font-mono text-[12px] text-ink-secondary">{sub}</span>
    </div>
  );
}
