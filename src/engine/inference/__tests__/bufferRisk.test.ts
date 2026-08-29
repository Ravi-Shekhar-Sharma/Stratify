import { describe, expect, it } from 'vitest';
import { estimateSecondsToEmpty, BUFFER_SMOOTHING_WINDOW, BUFFER_ETA_HORIZON_SECONDS } from '../bufferRisk';

describe('estimateSecondsToEmpty', () => {
  it('returns null with fewer samples than the smoothing window', () => {
    const history = Array(BUFFER_SMOOTHING_WINDOW - 1).fill(2.5);
    expect(estimateSecondsToEmpty(history, 45)).toBeNull();
  });

  it('returns null when the level is flat (no drop)', () => {
    const history = Array(BUFFER_SMOOTHING_WINDOW + 5).fill(2.5);
    expect(estimateSecondsToEmpty(history, 45)).toBeNull();
  });

  it('returns null when the level is rising (filling, not draining)', () => {
    const history = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
    expect(estimateSecondsToEmpty(history, 45)).toBeNull();
  });

  it('estimates a finite ETA for a genuine, sustained drain', () => {
    // Linear drain from 2.5 to ~1.0 over the window — should extrapolate
    // close to the true remaining time for a constant-rate drain.
    const secondsPerSample = 45;
    const history = [2.5, 2.125, 1.75, 1.375, 1.0];
    const eta = estimateSecondsToEmpty(history, secondsPerSample);
    expect(eta).not.toBeNull();
    // Rate: 1.5 units over 4 samples (180s) = 0.00833/s; last=1.0 -> ~120s.
    expect(eta!).toBeCloseTo(120, 0);
  });

  it('treats a horizon beyond BUFFER_ETA_HORIZON_SECONDS as stable (null), not an alarming ETA', () => {
    // A very slow, technically-nonzero drift that would take far longer
    // than the horizon to empty.
    const history = [2.5, 2.4999, 2.4998, 2.4997, 2.4996];
    const eta = estimateSecondsToEmpty(history, 45);
    if (eta !== null) expect(eta).toBeGreaterThan(BUFFER_ETA_HORIZON_SECONDS);
    // Either null (correctly suppressed) or, if not, must exceed the
    // horizon — never a small, alarming-looking number from this input.
  });

  it("doesn't false-alarm on a single noisy dip inside an otherwise flat window", () => {
    // One tick dips down then recovers — the kind of jitter that produced
    // the original last-two-sample bug (see bufferRisk.ts's doc comment).
    const history = [2.5, 2.5, 2.48, 2.5, 2.5, 2.5];
    const eta = estimateSecondsToEmpty(history, 45);
    // first-vs-last of the trailing window is flat (2.5 -> 2.5), so this
    // must not report a drain at all.
    expect(eta).toBeNull();
  });
});
