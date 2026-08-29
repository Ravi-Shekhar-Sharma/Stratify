/**
 * Display-only smoothing for the confidence NUMBER shown next to a
 * degrading or inferred value — never touches the model, the calibration,
 * or the stored per-visit confidence itself (predictSoftSensor's output is
 * unchanged; this only picks what to render).
 *
 * The raw calibrated confidence jumps between isotonic-calibration plateau
 * values even while a station is genuinely, continuously degraded or
 * trusted (measured directly: S6 during the demo incident bounces between
 * ~55.8% and ~80.8% for its entire post-onset run). Rendering that raw
 * bounce next to a value the user is being told to trust reads as
 * "unstable," which the underlying situation is not. Holding the running
 * MAXIMUM confidence seen since the current numeric-display episode began
 * gives a number that only ever rises or holds, matching what "the model
 * is now confident about this" should look like — it never invents a
 * higher value than one actually observed.
 *
 * The "episode" is whatever the caller considers numeric-worthy at each
 * point (isNumeric) — in stationDisplay.ts this is "alert active OR
 * confidence-hysteresis regime is 'inferred'" — and resets the moment
 * isNumeric was false one visit back.
 */
export function heldConfidence(confidences: readonly number[], isNumeric: readonly boolean[]): number {
  if (confidences.length === 0 || confidences.length !== isNumeric.length) {
    throw new Error('heldConfidence: confidences and isNumeric must be the same non-zero length');
  }
  const last = confidences.length - 1;
  if (!isNumeric[last]) {
    throw new Error('heldConfidence: the latest point must itself be numeric-worthy');
  }
  let max = confidences[last];
  for (let i = last - 1; i >= 0 && isNumeric[i]; i--) {
    max = Math.max(max, confidences[i]);
  }
  return max;
}
