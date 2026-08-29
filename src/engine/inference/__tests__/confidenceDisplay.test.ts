import { describe, expect, it } from 'vitest';
import { heldConfidence } from '../confidenceDisplay';

describe('heldConfidence', () => {
  it('returns the single value when the episode is one visit long', () => {
    expect(heldConfidence([0.7], [true])).toBe(0.7);
  });

  it('holds the running maximum across a bouncing plateau episode', () => {
    // Exactly the shape measured live during the demo incident: bounces
    // between a low and high isotonic plateau for the whole episode.
    const confidences = [0.731, 0.593, 0.808, 0.808, 0.558, 0.808];
    const isNumeric = [true, true, true, true, true, true];
    expect(heldConfidence(confidences, isNumeric)).toBe(0.808);
  });

  it('never decreases even when the latest raw value is lower than an earlier one this episode', () => {
    const confidences = [0.6, 0.9, 0.65];
    const isNumeric = [true, true, true];
    expect(heldConfidence(confidences, isNumeric)).toBe(0.9);
  });

  it('resets at an episode boundary — does not look past a false in isNumeric', () => {
    const confidences = [0.95, 0.4, 0.61, 0.62];
    const isNumeric = [true, false, true, true];
    // The 0.95 is from a PRIOR episode (isNumeric was false at index 1,
    // breaking the streak) and must not leak into the current one.
    expect(heldConfidence(confidences, isNumeric)).toBe(0.62);
  });

  it('throws if the latest point is not itself numeric-worthy', () => {
    expect(() => heldConfidence([0.6, 0.5], [true, false])).toThrow();
  });

  it('throws on mismatched or empty arrays', () => {
    expect(() => heldConfidence([], [])).toThrow();
    expect(() => heldConfidence([0.6], [true, false])).toThrow();
  });
});
