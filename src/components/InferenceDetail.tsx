import { PanelTitle } from './PanelTitle';
import { CONFIDENCE_CEILING } from '@/engine/inference/softSensor';
import type { StationViewModel } from '@/twinTypes';

interface Props {
  target: StationViewModel | null;
}

/**
 * Detail on whichever blind/partial station currently has something worth
 * explaining — the one behind the current recommendation, or (if the line
 * is nominal) the first station currently being actively estimated. Shows
 * nothing invented if there isn't one yet.
 */
export function InferenceDetail({ target }: Props) {
  if (!target) {
    return (
      <div className="flex h-full flex-col">
        <PanelTitle title="Inference Detail" subtitle="Soft-sensor estimate" />
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <span className="font-mono text-[11px] text-ink-muted">— no station currently being estimated —</span>
        </div>
      </div>
    );
  }

  const state = target.state;

  if (state.kind === 'abstained') {
    return (
      <div className="flex h-full flex-col">
        <PanelTitle title="Inference Detail" subtitle="Soft-sensor estimate" />
        <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[13px] font-bold text-ink-primary">{target.spec.id}</span>
            <span className="text-[12.5px] font-semibold text-ink-secondary">{target.spec.name}</span>
          </div>
          <div
            className="border border-line-soft px-3 py-2.5"
            style={{
              borderRadius: 0,
              backgroundImage:
                'repeating-linear-gradient(135deg, #3D4651 0px, #3D4651 1px, transparent 1px, transparent 7px)',
            }}
          >
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-ink-muted">Abstained</span>
            <p className="mt-1 text-[12px] leading-snug text-ink-secondary">{state.reason}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.kind !== 'inferred' && state.kind !== 'degrading') {
    return (
      <div className="flex h-full flex-col">
        <PanelTitle title="Inference Detail" subtitle="Soft-sensor estimate" />
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <span className="font-mono text-[11px] text-ink-muted">— {target.spec.id} is measured, not inferred —</span>
        </div>
      </div>
    );
  }

  const confidence = state.confidence ?? 0;
  const cycle = state.cycleSeconds;
  const degrading = state.kind === 'degrading';
  const ringColorClass = degrading ? 'text-slowing' : 'text-inferred';
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = confidence * c;

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Inference Detail" subtitle={`${target.spec.id} · ${target.spec.tier}`} />

      <div className="flex flex-1 items-center gap-5 px-4 pb-4 pt-3">
        <div className="relative h-[132px] w-[132px] shrink-0">
          <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
            <circle cx="66" cy="66" r={r} fill="none" stroke="#1E2730" strokeWidth="8" />
            <circle
              cx="66"
              cy="66"
              r={r}
              fill="none"
              className={ringColorClass}
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="butt"
              strokeDasharray={`${dash} ${c - dash}`}
              style={{ transition: 'stroke-dasharray 150ms ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-[34px] font-bold tabular-nums leading-none text-ink-primary">
              {(confidence * 100).toFixed(0)}
              <span className="text-[18px] text-ink-secondary">%</span>
            </span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">
              confidence
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <Row label="Station" value={`${target.spec.id} · ${target.spec.name}`} small />
          <Row
            label="Est. cycle"
            value={`~${cycle.toFixed(0)}s`}
            sub={`nominal ${target.spec.nominalCycleSeconds}s`}
            valueClass={degrading ? 'text-slowing' : 'text-ink-primary'}
          />
          <Row label="Confidence ceiling, this tier" value={`${(CONFIDENCE_CEILING * 100).toFixed(0)}%`} small />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  small,
  valueClass = 'text-ink-primary',
}: {
  label: string;
  value: string;
  sub?: string;
  small?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">{label}</span>
      <span className={`font-mono ${small ? 'text-[11px]' : 'text-[13px]'} font-semibold ${valueClass}`}>
        {value}
        {sub && <span className="ml-1.5 text-[10px] text-ink-secondary">({sub})</span>}
      </span>
    </div>
  );
}
