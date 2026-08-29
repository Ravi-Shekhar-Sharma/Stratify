/**
 * The bottleneck/degrading alert, decoupled from confidence entirely — the
 * same trigger ml/validate.py's alert metric uses to compute the S6->S9
 * lead-time evidence (predicted cycle time >= nominal*ALERT_MULTIPLIER,
 * no confidence gate anywhere in that definition). Confidence-hysteresis
 * debounce (confidenceHysteresis.ts) is a SEPARATE mechanism that governs
 * only the Abstained<->Inferred display at rest; it must never gate this
 * signal, or the on-screen warning silently stops matching the lead time
 * the evidence claims.
 *
 * A light, single-threshold consecutive-count debounce (no dead band) is
 * still applied — ALERT_MIN_HOLD, chosen from measured data
 * (src/engine/measureDemoScenario.ts): across all 6 blind stations'
 * full-shift no-incident runs, the predicted cycle time never once crosses
 * the alert threshold at rest (0 crossings, every station, ~58-74 visits
 * each) — minHold=1 (no debounce at all) would also produce zero false
 * alarms in that data. minHold=2 is kept anyway as real, if minimal,
 * protection against a single-visit fluke in a seed/station this hasn't
 * been measured against — "light debounce against noise" was explicitly
 * asked for, not "no debounce that happens to work on one seed."
 *
 * This does cost measured lead time in the demo incident: minHold=1 would
 * commit ~79s earlier (the run's second post-onset visit is what actually
 * satisfies minHold=2 — see measureDemoScenario.ts's "Cycle-time alert
 * signal" section for the exact ticks). That's a real, disclosed
 * trade-off, not a hidden one — switch to 1 if maximum responsiveness is
 * preferred over that small margin.
 */
export const ALERT_MIN_HOLD = 2;

/** Whether the alert is active at each point in an ordered sequence of
 *  predicted cycle times, given a single threshold and a required number
 *  of consecutive crossings before the alert commits. Pure function of the
 *  whole sequence, like confidenceHysteresis.ts's resolvers — no external
 *  state, independently checkable. */
export function resolveAlertSequence(
  cycleTimes: readonly number[],
  threshold: number,
  minHold: number = ALERT_MIN_HOLD,
): boolean[] {
  const result: boolean[] = [];
  let active = false;
  let run = 0;
  for (const value of cycleTimes) {
    const crossing = value >= threshold;
    if (crossing === active) {
      run = 0;
    } else {
      run++;
      if (run >= minHold) {
        active = crossing;
        run = 0;
      }
    }
    result.push(active);
  }
  return result;
}
