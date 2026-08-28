import { ArrowRight, Gauge, UserPlus, ShieldAlert } from 'lucide-react';
import type { RecommendationState } from '@/types';

interface Props {
  reco: RecommendationState;
}

export function RecommendedAction({ reco }: Props) {
  const hasActions = reco.actions.length > 0;
  return (
    <div
      className={`border bg-panel px-5 py-4 transition-colors duration-300 ${
        hasActions ? 'border-slowing/40' : 'border-line'
      }`}
      style={{ borderRadius: 3 }}
    >
      <div className="flex items-center gap-2.5">
        <ShieldAlert
          className={`h-5 w-5 ${hasActions ? 'text-slowing' : 'text-ink-secondary'}`}
          strokeWidth={2}
        />
        <h3 className="text-[12px] font-bold uppercase tracking-[0.18em] text-ink-primary">
          Recommended Action
        </h3>
        {!hasActions && (
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-ink-secondary">
            line nominal
          </span>
        )}
      </div>

      {hasActions ? (
        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          {reco.actions.map((a, i) => (
            <div
              key={i}
              className="flex items-start gap-3 border border-line bg-panel-raised px-3.5 py-3"
              style={{ borderRadius: 3 }}
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-slowing/40 bg-slowing/10" style={{ borderRadius: 2 }}>
                {i === 0 ? (
                  <UserPlus className="h-3.5 w-3.5 text-slowing" />
                ) : (
                  <Gauge className="h-3.5 w-3.5 text-slowing" />
                )}
              </span>
              <div className="flex flex-col">
                <span className="font-mono text-[9px] uppercase tracking-wider text-ink-secondary">
                  {`A${i + 1}`}
                </span>
                <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-snug text-ink-primary">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slowing" />
                  {a}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-[12.5px] text-ink-secondary">
          No action required. All stations within takt.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-ink-secondary" />
        <p className="text-[11px] italic text-ink-secondary">{reco.note}</p>
      </div>
    </div>
  );
}
