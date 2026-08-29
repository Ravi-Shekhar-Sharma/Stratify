import { describe, expect, it } from 'vitest';
import {
  resolveConfidenceRegime,
  resolveConfidenceRegimeSequence,
  countFlips,
  DEFAULT_HYSTERESIS_CONFIG,
  NO_HYSTERESIS_CONFIG,
} from '../confidenceHysteresis';

describe('resolveConfidenceRegime', () => {
  it('bootstraps to inferred if the very first value clears the upper threshold', () => {
    expect(resolveConfidenceRegime([0.85])).toBe('inferred');
  });

  it('bootstraps to abstained if the very first value does not clear the upper threshold', () => {
    expect(resolveConfidenceRegime([0.58])).toBe('abstained');
    expect(resolveConfidenceRegime([0.6])).toBe('abstained'); // exactly at floor, below floor+margin
  });

  it('a single noisy crossing above the floor does not flip an abstained regime', () => {
    // Confidence brushes 0.66 for one visit (inside the dead band under the
    // default 0.10 margin, upper threshold 0.70) then falls back — measured
    // rest behaviour looks exactly like this.
    const confidences = [0.56, 0.58, 0.57, 0.66, 0.57, 0.58];
    expect(resolveConfidenceRegime(confidences)).toBe('abstained');
  });

  it('two consecutive crossings above the upper threshold do not flip (minHold=3)', () => {
    const confidences = [0.56, 0.58, 0.8, 0.75, 0.57, 0.58];
    expect(resolveConfidenceRegime(confidences)).toBe('abstained');
  });

  it('three consecutive crossings above the upper threshold flip to inferred and it sticks', () => {
    const confidences = [0.56, 0.58, 0.8, 0.8, 0.8, 0.56, 0.58];
    // A single dip back into the dead band (0.56 is BELOW the lower
    // threshold 0.50? no: 0.56 > 0.50, so it's in the dead band and
    // registers no candidate) must not undo the commit.
    expect(resolveConfidenceRegime(confidences)).toBe('inferred');
  });

  it('a genuine, sustained drop below the lower threshold reverts to abstained', () => {
    const confidences = [0.8, 0.8, 0.8, 0.4, 0.4, 0.4];
    const seq = resolveConfidenceRegimeSequence(confidences);
    expect(seq[2]).toBe('inferred'); // committed after 3 consecutive highs
    expect(seq[5]).toBe('abstained'); // reverted after 3 consecutive lows
  });

  it('resolveConfidenceRegimeSequence + countFlips matches manual counting on a known sequence', () => {
    const confidences = [0.56, 0.58, 0.8, 0.8, 0.8, 0.58, 0.56, 0.4, 0.4, 0.4];
    const seq = resolveConfidenceRegimeSequence(confidences);
    expect(seq).toEqual([
      'abstained',
      'abstained',
      'abstained',
      'abstained',
      'inferred',
      'inferred',
      'inferred',
      'inferred',
      'inferred',
      'abstained',
    ]);
    expect(countFlips(seq)).toBe(2);
  });

  it('with NO_HYSTERESIS_CONFIG, every floor crossing flips immediately (the "before" baseline)', () => {
    const confidences = [0.56, 0.65, 0.58, 0.7, 0.59];
    const seq = resolveConfidenceRegimeSequence(confidences, NO_HYSTERESIS_CONFIG);
    expect(seq).toEqual(['abstained', 'inferred', 'abstained', 'inferred', 'abstained']);
    expect(countFlips(seq)).toBe(4);
  });

  it('the default config produces materially fewer flips than no hysteresis on noisy rest-like data', () => {
    // A synthetic approximation of measured rest behaviour: mostly near the
    // floor, occasionally spiking to the isotonic ceiling for one visit.
    const restLike = [0.56, 0.58, 0.57, 0.81, 0.56, 0.57, 0.58, 0.6, 0.57, 0.81, 0.66, 0.56, 0.57, 0.58, 0.6];
    const before = countFlips(resolveConfidenceRegimeSequence(restLike, NO_HYSTERESIS_CONFIG));
    const after = countFlips(resolveConfidenceRegimeSequence(restLike, DEFAULT_HYSTERESIS_CONFIG));
    expect(after).toBeLessThan(before);
    expect(after).toBe(0); // stays stably abstained throughout
  });

  it('throws on an empty sequence rather than silently returning a default', () => {
    expect(() => resolveConfidenceRegime([])).toThrow();
  });
});

describe('DEFAULT_HYSTERESIS_CONFIG', () => {
  it('is derived from, not equal to, CONFIDENCE_FLOOR — margin must be strictly positive and minHold > 1', () => {
    expect(DEFAULT_HYSTERESIS_CONFIG.floor).toBe(0.6);
    expect(DEFAULT_HYSTERESIS_CONFIG.margin).toBeGreaterThan(0);
    expect(DEFAULT_HYSTERESIS_CONFIG.minHold).toBeGreaterThan(1);
  });
});
