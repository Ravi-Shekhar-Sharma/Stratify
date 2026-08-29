/**
 * Time-to-empty from a SMOOTHED drain rate (first vs last of a trailing
 * window), not the last two samples. The buffer level jitters by ±5%
 * cycle-time noise every step (see docs/assumptions.md's "ML modelling
 * choices"), so a last-two-sample slope (window=2) is dominated by noise
 * during ordinary steady state — measured directly, it produced a
 * technically-correct but useless multi-hour extrapolation
 * (src/engine/measureDemoScenario.ts's window sweep reproduces this: window=2
 * gives a worst-case false-alarm ETA of ~256,767s, i.e. ~71 hours, on real
 * steady-state data).
 *
 * The window can't just be made arbitrarily long to fix that, though: the
 * demo incident's own real drain (S6 55->80s) empties the buffer in
 * measured ~475s. A window of 10 samples (450s of sim time, the previous
 * value here) is comparable to the ENTIRE drain event's duration, so the
 * displayed ETA badly lags the true remaining time for most of it — the
 * same measurement script shows window=10 doesn't produce a usable
 * (within 2x of true) estimate until +224s after onset, well over half the
 * drain's own length. Window=4 (180s) was swept against the same real
 * rest and incident traces and gives the fastest usable-estimate time
 * (+89s after onset) with no false alarm ever observed at rest in that
 * trace — window=3 ties the tracking speed but with one fewer sample of
 * margin against noise, so 4 was kept as the safer of the two equally-fast
 * options. Horizons beyond BUFFER_ETA_HORIZON_SECONDS are still reported as
 * "stable" rather than an alarming, low-confidence ETA — a UI pacing
 * choice for this panel, not a modelling assumption. Re-run the window
 * sweep if the incident scenario or its severity ever changes; this value
 * is fit to the demo's specific drain speed, not a general default.
 *
 * Exported (not inlined in useEngineTwin.ts) so a measurement script can run
 * the exact same estimator the live UI uses against a full offline trace —
 * see src/engine/measureDemoScenario.ts's buffer-ETA accuracy check.
 */
export const BUFFER_SMOOTHING_WINDOW = 4;
export const BUFFER_ETA_HORIZON_SECONDS = 3600;

export function estimateSecondsToEmpty(history: readonly number[], secondsPerSample: number): number | null {
  if (history.length < BUFFER_SMOOTHING_WINDOW) return null;
  const window = history.slice(-BUFFER_SMOOTHING_WINDOW);
  const first = window[0];
  const last = window[window.length - 1];
  const drop = first - last;
  if (drop <= 1e-9) return null;

  const secondsElapsed = (window.length - 1) * secondsPerSample;
  const dropPerSecond = drop / secondsElapsed;
  const secondsToEmpty = last / dropPerSecond;
  return secondsToEmpty <= BUFFER_ETA_HORIZON_SECONDS ? secondsToEmpty : null;
}
