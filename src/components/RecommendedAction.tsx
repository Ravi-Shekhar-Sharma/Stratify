import type { Recommendation } from '@/twinTypes';

interface Props {
  recommendation: Recommendation;
}

/**
 * Exactly one recommendation, never a list — a supervisor with a line
 * running does not read a list. If more than one station needs attention,
 * this still shows only the single worst one (see
 * useEngineTwin.ts's computeRecommendation); the events feed carries the
 * rest.
 */
export function RecommendedAction({ recommendation }: Props) {
  if (recommendation.kind === 'nominal') {
    return (
      <div className="border border-line bg-panel px-5 py-4" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 bg-measured" />
          <h3 className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-primary">Recommended Action</h3>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-secondary">
            line nominal
          </span>
        </div>
        <p className="mt-2.5 text-[12.5px] text-ink-secondary">
          No action required. All measured and inferred cycle times are within takt.
        </p>
      </div>
    );
  }

  if (recommendation.kind === 'degrading') {
    const overPct = (recommendation.cycleSeconds / recommendation.nominalCycleSeconds - 1) * 100;
    const action =
      recommendation.basis === 'inferred' && recommendation.confidence !== undefined
        ? `Move one operator to ${recommendation.stationId}. Adding a cycle sensor there would raise achievable confidence from ${(
            recommendation.confidence * 100
          ).toFixed(0)}% to ${(recommendation.confidenceCeiling * 100).toFixed(0)}%.`
        : `Move one operator to ${recommendation.stationId} to restore takt.`;

    return (
      <div className="border border-slowing/40 bg-panel px-5 py-4" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 bg-slowing" />
          <h3 className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-primary">Recommended Action</h3>
        </div>
        <div className="mt-3 border border-line bg-panel-raised px-3.5 py-3" style={{ borderRadius: 0 }}>
          <span className="font-mono text-[9px] uppercase tracking-wider text-ink-secondary">
            {recommendation.stationId} · {recommendation.stationName} · +{overPct.toFixed(0)}% over nominal
          </span>
          <p className="mt-1 text-[13px] font-semibold leading-snug text-ink-primary">{action}</p>
        </div>
        <Note />
      </div>
    );
  }

  return (
    <div className="border border-line-soft bg-panel px-5 py-4" style={{ borderRadius: 0 }}>
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 bg-ink-muted" />
        <h3 className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-primary">Recommended Action</h3>
      </div>
      <div className="mt-3 border border-line bg-panel-raised px-3.5 py-3" style={{ borderRadius: 0 }}>
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-secondary">
          {recommendation.stationId} · {recommendation.stationName} · abstained
        </span>
        <p className="mt-1 text-[13px] font-semibold leading-snug text-ink-primary">
          {recommendation.reason} Add direct instrumentation at {recommendation.stationId} to restore an estimate.
        </p>
      </div>
      <Note />
    </div>
  );
}

function Note() {
  return (
    <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-2.5">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-secondary" />
      <p className="text-[11px] italic text-ink-secondary">Stratify never stops the line. A person decides.</p>
    </div>
  );
}
