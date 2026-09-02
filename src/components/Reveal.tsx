import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { isInViewport } from '@/viewport';

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Stagger index within a group of siblings revealing together. */
  index?: number;
}

// Generous lead-in: the reveal starts resolving before the panel's box
// technically reaches the viewport, so by the time a normal scroll speed
// brings it fully into view the transition has already finished rather
// than being caught mid-resolve right where the reader needs to read it.
// Bumped alongside the slower settle below (was 160) so the longer
// transition still has room to finish before a normal scroll needs it read.
const VIEWPORT_BUFFER = 240;

// A small fixed pause before the settle animation begins, stacked with the
// existing per-item stagger - this is what makes the reveal read as
// "delayed" rather than an instant snap to a new opacity the moment the
// viewport check flips.
const BASE_DELAY = 0.08;

/**
 * Reusable scroll-reveal for secondary section blocks. Deliberately NOT
 * built on `IntersectionObserver` — a version that was tried here read as
 * "not working" in practice: a wide rootMargin needed to stay safe against
 * a blank page made the exit dim (opacity 1 -> .88, no visible entrance)
 * too subtle to register as a real effect, and a stricter version that
 * gated the entrance on "has this ever been confirmed in view" never
 * actually played the entrance animation at all — it just held content at
 * full opacity indefinitely, which reads as "not working" too, just the
 * opposite failure mode. This version checks the element's own
 * `getBoundingClientRect()` against the viewport directly, on every
 * scroll/resize event via a rAF-throttled handler, and drives a SINGLE
 * two-way state — no batching ambiguity, no "has it ever" tracking, no
 * margin tuning: either the element's box overlaps the viewport (plus a
 * small buffer) right now or it doesn't, checked freshly every time.
 *
 * Still safe-by-default: `visible` starts `true` and the component's
 * `initial` state is fully opaque, so nothing is ever gated behind a
 * signal that might not arrive — worst case (the check never runs at all)
 * is a static, fully visible block, never a blank one. The "not in view"
 * state is deliberately real, not a near-imperceptible dim (a previous
 * version at opacity .88, and again at .7, read as "not working" in
 * practice against this dark palette). Duration and blur have moved
 * several times since: too slow/blurry once (4px held for 500ms) read as
 * broken, the correction to 2px/280ms overcorrected into a quick pop, and
 * 5px/420ms still read as too immediate. A small fixed lead-in
 * (BASE_DELAY) before the settle even starts, on top of a slightly longer
 * 480ms spring, is what actually reads as a deliberate, unhurried settle
 * rather than an instant reaction to the scroll position - with
 * VIEWPORT_BUFFER's lead-in (below) still guaranteeing it fully resolves
 * before an ordinary scroll needs it read.
 *
 * Never wrap the hero or live-incident content in this — that must be
 * visible immediately and must never fade for any reason.
 */
export function Reveal({ children, className, index = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let ticking = false;
    const check = () => {
      ticking = false;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      setVisible(isInViewport(rect, vh, VIEWPORT_BUFFER));
    };
    const onScrollOrResize = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(check);
    };

    check();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, []);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      animate={
        visible
          ? { opacity: 1, y: 0, filter: 'blur(0px)' }
          : { opacity: 0.35, y: 22, filter: 'blur(5px)' }
      }
      transition={{ type: 'spring', duration: 0.5, bounce: 0, delay: BASE_DELAY + index * 0.035 }}
    >
      {children}
    </motion.div>
  );
}
