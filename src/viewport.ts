/** Pure so it's directly testable without a DOM — the one place a subtle
 *  sign/off-by-one error in a scroll-reveal's "is this in view" check would
 *  silently make it one-directional instead of two. */
export function isInViewport(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  buffer: number,
): boolean {
  return rect.bottom > -buffer && rect.top < viewportHeight + buffer;
}
