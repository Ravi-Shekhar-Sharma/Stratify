import { motion, AnimatePresence } from 'motion/react';
import { STATE_TRANSITION, VALUE_CHANGE } from '@/motion';
import { Panel } from './Panel';
import { PanelTitle } from './PanelTitle';
import { CONFIDENCE_CEILING } from '@/engine/inference/softSensor';
import { SENSORED_CONFIDENCE_CEILING } from '@/engine/assumptions';
import type { Recommendation } from '@/twinTypes';

interface Props {
  recommendation: Recommendation;
}

/**
 * The one place this product tells a person what to do — and the one place
 * it reminds them it never does it for them. At rest it still shows the
 * confidence-lift instrument (the system's own blind/partial ceiling vs.
 * what adding a sensor would buy), scaled to real constants rather than
 * collapsing to a single sentence — the same "idling instrument, not an
 * empty box" treatment as Inference Detail.
 */
export function RecommendedAction({ recommendation }: Props) {
  const key =
    recommendation.kind === 'nominal' ? 'nominal' : `${recommendation.kind}:${recommendation.stationId}`;
  const nominal = recommendation.kind === 'nominal';

  return (
    <Panel elevation="raised" className="flex h-full flex-col overflow-hidden">
      <PanelTitle title="Recommended Action" subtitle="Action" />
      <div className="flex flex-1 flex-col gap-4 px-7 py-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={STATE_TRANSITION}
            className="flex flex-col gap-4"
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${nominal ? 'bg-measured' : recommendation.kind === 'degrading' ? 'bg-cyan' : 'bg-ink-faint'}`} />
              <span className="font-mono text-caption uppercase tracking-[0.08em] text-white/50">
                {nominal ? 'Nominal' : recommendation.kind === 'degrading' ? 'Move one operator' : 'Add instrumentation'}
              </span>
            </div>

            <p className="text-[16px] leading-[1.6] text-ink-primary">
              {nominal
                ? 'Within takt. No action pending.'
                : recommendation.kind === 'degrading'
                  ? (
                    <>
                      Move one operator to <span className="font-semibold">{recommendation.stationId}</span> to
                      restore takt.
                    </>
                  )
                  : (
                    <>
                      {recommendation.reason} Add a sensor at{' '}
                      <span className="font-semibold">{recommendation.stationId}</span> to restore an estimate.
                    </>
                  )}
            </p>
          </motion.div>
        </AnimatePresence>

        <ConfidenceLift
          from={!nominal && 'confidence' in recommendation ? recommendation.confidence : undefined}
          to={!nominal && 'confidenceCeiling' in recommendation ? recommendation.confidenceCeiling : undefined}
          resting={nominal}
        />

        <p className="mt-auto border-t border-line-soft pt-3 text-[12px] italic text-white/50">
          Stratify never stops the line. A person decides.
        </p>
      </div>
    </Panel>
  );
}

function ConfidenceLift({ from, to, resting }: { from: number | undefined; to: number | undefined; resting: boolean }) {
  // At rest there is no specific station to project a lift for, so the
  // instrument shows the system's own two real ceilings instead of nothing:
  // the blind/partial soft-sensor cap vs. the sensored-tier cap a sensor
  // would buy anywhere on the line — both real constants, never fabricated.
  const fromPct = Math.round((from ?? CONFIDENCE_CEILING) * 100);
  const toPct = Math.round((to ?? SENSORED_CONFIDENCE_CEILING) * 100);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line-soft bg-panel-inset/60 px-4 py-3">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/50">
        {resting ? 'A sensor anywhere raises achievable confidence' : 'A sensor there raises achievable confidence'}
      </span>
      <div className="flex items-center gap-3">
        <span className={`font-mono text-[15px] font-semibold tabular-nums ${resting ? 'text-ink-muted' : 'text-inferred'}`}>
          {fromPct}%
        </span>
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-panel-raised">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${resting ? 'bg-ink-faint' : 'bg-inferred/50'}`}
            initial={{ width: 0 }}
            animate={{ width: `${fromPct}%` }}
            transition={VALUE_CHANGE}
          />
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${resting ? 'bg-line-strong' : 'bg-measured'}`}
            initial={{ width: 0 }}
            animate={{ width: `${toPct}%` }}
            transition={{ ...VALUE_CHANGE, delay: 0.15 }}
          />
        </div>
        <span className={`font-mono text-[15px] font-semibold tabular-nums ${resting ? 'text-ink-secondary' : 'text-measured'}`}>
          {toPct}%
        </span>
      </div>
    </div>
  );
}
