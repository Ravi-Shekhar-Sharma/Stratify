import { describe, expect, it } from 'vitest';
import { isInViewport } from '../viewport';

const VIEWPORT_H = 800;
const BUFFER = 80;

describe('isInViewport', () => {
  it('is true when the element sits fully inside the viewport', () => {
    expect(isInViewport({ top: 100, bottom: 300 }, VIEWPORT_H, BUFFER)).toBe(true);
  });

  it('is true when the element straddles the top edge (entering downward scroll)', () => {
    expect(isInViewport({ top: -50, bottom: 50 }, VIEWPORT_H, BUFFER)).toBe(true);
  });

  it('is true when the element straddles the bottom edge (entering upward scroll)', () => {
    expect(isInViewport({ top: 750, bottom: 850 }, VIEWPORT_H, BUFFER)).toBe(true);
  });

  it('is false once the element has scrolled fully above the viewport, past the buffer', () => {
    expect(isInViewport({ top: -400, bottom: -200 }, VIEWPORT_H, BUFFER)).toBe(false);
  });

  it('is false once the element has scrolled fully below the viewport, past the buffer', () => {
    expect(isInViewport({ top: 1200, bottom: 1400 }, VIEWPORT_H, BUFFER)).toBe(false);
  });

  it('is true just inside the buffer above the viewport (the buffer keeps the trigger from being flush with the edge)', () => {
    expect(isInViewport({ top: -70, bottom: -10 }, VIEWPORT_H, BUFFER)).toBe(true);
  });

  it('is false just outside the buffer above the viewport', () => {
    expect(isInViewport({ top: -200, bottom: -90 }, VIEWPORT_H, BUFFER)).toBe(false);
  });

  it('is symmetric: an element that was in view and then scrolled away reports false, and reports true again if scrolled back', () => {
    const inView = { top: 200, bottom: 400 };
    const scrolledAway = { top: -2000, bottom: -1800 };
    expect(isInViewport(inView, VIEWPORT_H, BUFFER)).toBe(true);
    expect(isInViewport(scrolledAway, VIEWPORT_H, BUFFER)).toBe(false);
    expect(isInViewport(inView, VIEWPORT_H, BUFFER)).toBe(true);
  });

  it('handles an element taller than the viewport as always in view while any part overlaps', () => {
    expect(isInViewport({ top: -5000, bottom: 5000 }, VIEWPORT_H, BUFFER)).toBe(true);
  });
});
