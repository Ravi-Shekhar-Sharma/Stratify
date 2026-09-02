import { useEffect, useState } from 'react';
import { animate } from 'motion';
import { useReducedMotion } from 'motion/react';
import { DRAW_IN } from '@/motion';
import type { AlertMetricsByBand, LeadTimeBundle } from '@/trustMetrics';

interface Props {
  alertBands: AlertMetricsByBand;
  deliverable: LeadTimeBundle;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`;
}

/**
 * The false alarm rate as an actual headline claim, not a number sharing
 * a row with a caveat — most competing teams will not show this at all.
 * The marginal-band shortfall gets equal structural weight in its own
 * labelled block ("stated limit"), not a clause buried in a sentence:
 * both are the strongest things on this page precisely because they are
 * shown at all, so both get real visual weight (Round 2 item 5).
 */
export function FalseAlarmCallout({ alertBands, deliverable }: Props) {
  const far = alertBands.easy.falseAlarmRate;
  const marginalMissRate = 1 - (deliverable.byBand.marginal.warningFireRate ?? 1);
  const reduceMotion = useReducedMotion();
  const [displayFar, setDisplayFar] = useState(reduceMotion ? far : 0);

  // Deliberately no "has this already run" guard: React 18 StrictMode
  // double-invokes this effect in dev (mount -> cleanup -> mount), and a
  // guard that survives the synthetic cleanup would let the first,
  // immediately-cancelled animate() call win, freezing the display at
  // whatever value it was stopped on. Letting it run again on the second,
  // real invocation is correct in both dev and production, since production
  // never double-invokes at all.
  useEffect(() => {
    if (reduceMotion) {
      setDisplayFar(far);
      return;
    }
    const controls = animate(0, far, {
      duration: DRAW_IN.duration + 0.15,
      ease: DRAW_IN.ease,
      onUpdate: (v) => setDisplayFar(v),
    });
    return () => controls.stop();
  }, [far, reduceMotion]);

  return (
    <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-stretch">
      <div className="flex flex-1 flex-col justify-center gap-2">
        <span className="text-caption font-bold uppercase tracking-[0.16em] text-ink-muted">False alarm rate</span>
        <span className="font-mono text-[64px] font-bold leading-none tabular-nums text-measured">{pct(displayFar)}</span>
        <span className="max-w-[42ch] text-[15px] leading-[1.55] text-white/72">{alertBands.falseAlarmRateDefinition}</span>
      </div>

      <div className="hidden w-px self-stretch bg-line lg:block" />

      <div className="flex flex-1 flex-col justify-center gap-2 rounded border border-slowing/30 bg-slowing/5 px-5 py-5">
        <span className="text-caption font-bold uppercase tracking-[0.16em] text-slowing">Stated limit, not a caveat</span>
        <p className="text-[15px] leading-[1.55] text-white/80">
          On the <span className="font-mono font-semibold text-ink-primary">marginal</span> severity band,{' '}
          <span className="font-mono text-[22px] font-bold text-slowing">{pct(marginalMissRate)}</span> of incidents
          currently produce no deliverable warning at all - the real recall cost of requiring a debounced,
          physically-available alert rather than reacting to a single noisy crossing. Shown here on purpose: a low
          false-alarm rate is only half the honesty this product sells.
        </p>
      </div>
    </div>
  );
}
