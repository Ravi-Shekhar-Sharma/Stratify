import { describe, expect, it } from 'vitest';
import { resolveAlertSequence, ALERT_MIN_HOLD } from '../alertSignal';

describe('resolveAlertSequence', () => {
  it('starts inactive and stays inactive below threshold', () => {
    const seq = resolveAlertSequence([50, 51, 52], 62.1);
    expect(seq).toEqual([false, false, false]);
  });

  it('a single crossing does not activate below the default minHold', () => {
    const seq = resolveAlertSequence([50, 70, 50], 62.1);
    expect(seq).toEqual([false, false, false]);
  });

  it('commits once minHold consecutive crossings are seen, at the run-completing sample', () => {
    const seq = resolveAlertSequence([50, 70, 71, 72], 62.1, 2);
    // index0: 50 -> false. index1: 70, run=1 (<2) -> still false.
    // index2: 71, run=2 (>=2) -> commits true HERE, not at index1.
    expect(seq).toEqual([false, false, true, true]);
  });

  it('with minHold=1, commits immediately on the first crossing (no debounce)', () => {
    const seq = resolveAlertSequence([50, 70, 71], 62.1, 1);
    expect(seq).toEqual([false, true, true]);
  });

  it('stays active through noise that never accumulates minHold consecutive below-threshold samples', () => {
    // One dip below threshold, immediately followed by a value back above —
    // never 2 in a row, so with minHold=2 the alert must not clear.
    const seq = resolveAlertSequence([70, 71, 50, 72, 73], 62.1, 2);
    expect(seq[2]).toBe(true); // the single dip alone doesn't clear it
    expect(seq[4]).toBe(true);
  });

  it('clears after minHold consecutive below-threshold samples, symmetrically', () => {
    const seq = resolveAlertSequence([70, 71, 72, 50, 49, 48], 62.1, 2);
    expect(seq[2]).toBe(true);
    expect(seq[5]).toBe(false);
  });

  it('the exported default (ALERT_MIN_HOLD) is a real debounce, not zero', () => {
    expect(ALERT_MIN_HOLD).toBeGreaterThanOrEqual(1);
  });
});
