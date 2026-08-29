import type { StationSpec } from '@/engine/types';
import type { StationDisplayState } from '@/engine/inference/stationDisplay';

interface Props {
  spec: StationSpec;
  state: StationDisplayState;
}

/**
 * The four states this product's whole trust model is built on. Rendering
 * rules, matched exactly to the brief:
 *  - Measured: plain value, no marker, deliberately unremarkable.
 *  - Inferred: accent colour, a persistent marker, confidence always shown
 *    adjacent — never rendered without it.
 *  - Degrading: warning colour with a trend direction. If the underlying
 *    value is itself inferred (basis: 'inferred'), confidence is still
 *    shown — "never render an inferred value without its confidence" has
 *    no exception for a degrading overlay.
 *  - Abstained: muted, hatched, with the reason string — a stated
 *    methodological refusal, not an error state, so it must look
 *    deliberate rather than broken.
 * 'pending' (no inferable data yet) is a fifth, internal-only case: a
 * plain empty state, never styled to resemble any of the four above.
 */
export function StationCard({ spec, state }: Props) {
  return (
    <div
      className={cardClass(state)}
      style={{ borderRadius: 0, ...cardBackgroundStyle(state) }}
      role="group"
      aria-label={`Station ${spec.id} ${spec.name}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold tracking-wider text-ink-primary">{spec.id}</span>
        {state.kind === 'inferred' && <span className="h-2 w-2 shrink-0 bg-inferred" aria-hidden />}
        {state.kind === 'degrading' && (
          <span
            className={`font-mono text-[12px] leading-none ${state.trend === 'up' ? 'text-slowing' : 'text-slowing'}`}
            aria-label={`trend ${state.trend}`}
          >
            {state.trend === 'up' ? '▲' : '▼'}
          </span>
        )}
      </div>

      <div className="mt-1 text-[12.5px] font-semibold leading-tight text-ink-primary">{spec.name}</div>

      <StateBody spec={spec} state={state} />
    </div>
  );
}

function cardClass(state: StationDisplayState): string {
  const base = 'relative flex w-[128px] flex-col border p-2.5';
  switch (state.kind) {
    case 'measured':
      return `${base} border-line bg-panel`;
    case 'inferred':
      return `${base} border-dashed border-inferred/60 bg-panel`;
    case 'degrading':
      return `${base} border-slowing/60 bg-panel`;
    case 'abstained':
      return `${base} border-line-soft bg-panel-inset`;
    case 'pending':
      return `${base} border-line-soft bg-panel-inset opacity-60`;
  }
}

function cardBackgroundStyle(state: StationDisplayState): React.CSSProperties {
  if (state.kind !== 'abstained') return {};
  return {
    backgroundImage:
      'repeating-linear-gradient(135deg, #3D4651 0px, #3D4651 1px, transparent 1px, transparent 7px)',
  };
}

function StateBody({ spec, state }: Props) {
  switch (state.kind) {
    case 'pending':
      return (
        <div className="mt-2.5 flex flex-1 flex-col justify-center">
          <span className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">— no data yet —</span>
        </div>
      );

    case 'measured':
      return (
        <>
          <ValueRow cycleSeconds={state.cycleSeconds} valueClass="text-ink-primary" />
          <Tag label="MEASURED" tone="plain" />
        </>
      );

    case 'inferred':
      return (
        <>
          <ValueRow cycleSeconds={state.cycleSeconds} valueClass="text-inferred" />
          <Tag label="INFERRED" tone="inferred" />
          <ConfidenceLine confidence={state.confidence} />
        </>
      );

    case 'degrading':
      return (
        <>
          <ValueRow cycleSeconds={state.cycleSeconds} valueClass="text-slowing" sub={`nominal ${spec.nominalCycleSeconds}s`} />
          <Tag label={state.basis === 'inferred' ? 'INFERRED · DEGRADING' : 'DEGRADING'} tone="degrading" />
          {state.basis === 'inferred' && <ConfidenceLine confidence={state.confidence} />}
        </>
      );

    case 'abstained':
      return (
        <>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="font-mono text-[20px] font-bold tabular-nums text-ink-muted">—</span>
          </div>
          <Tag label="ABSTAINED" tone="abstained" />
          <p className="mt-1.5 text-[10px] leading-snug text-ink-secondary">{state.reason}</p>
        </>
      );
  }
}

function ValueRow({
  cycleSeconds,
  valueClass,
  sub,
}: {
  cycleSeconds: number;
  valueClass: string;
  sub?: string;
}) {
  return (
    <div className="mt-2.5 flex items-baseline gap-1">
      <span className={`font-mono text-[20px] font-bold tabular-nums ${valueClass}`}>
        {cycleSeconds.toFixed(0)}
      </span>
      <span className="text-[10px] font-medium text-ink-secondary">s</span>
      {sub && <span className="ml-1 text-[9px] text-ink-muted">({sub})</span>}
    </div>
  );
}

function ConfidenceLine({ confidence }: { confidence: number | undefined }) {
  if (confidence === undefined) return null;
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <span className="text-[8px] font-semibold uppercase tracking-wider text-ink-muted">Confidence</span>
      <span className="ml-auto font-mono text-[10px] font-bold tabular-nums text-inferred">
        {(confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function Tag({ label, tone }: { label: string; tone: 'plain' | 'inferred' | 'degrading' | 'abstained' }) {
  const cls =
    tone === 'inferred'
      ? 'border-inferred/40 bg-inferred/10 text-inferred'
      : tone === 'degrading'
        ? 'border-slowing/40 bg-slowing/10 text-slowing'
        : tone === 'abstained'
          ? 'border-line text-ink-muted'
          : 'border-line bg-panel-raised text-ink-secondary';
  return (
    <div className="mt-2">
      <span
        className={`inline-block border px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.14em] ${cls}`}
        style={{ borderRadius: 0 }}
      >
        {label}
      </span>
    </div>
  );
}
