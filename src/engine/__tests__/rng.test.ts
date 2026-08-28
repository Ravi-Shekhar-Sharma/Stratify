import { describe, expect, it } from 'vitest';
import { createRng, jitter } from '../rng';

describe('seeded rng', () => {
  it('is deterministic: same seed produces the same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('produces values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('jitter(0) is always exactly 0, regardless of the draw', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      expect(jitter(rng, 0)).toBe(0);
    }
  });

  it('jitter(rng, fraction) stays within [-fraction, +fraction]', () => {
    const rng = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const j = jitter(rng, 0.05);
      expect(j).toBeGreaterThanOrEqual(-0.05);
      expect(j).toBeLessThan(0.05);
    }
  });
});
