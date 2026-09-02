/**
 * Shared motion presets (design direction: 200-400ms, ease-out for entrances/
 * draws, critically-damped springs for anything that can be interrupted
 * mid-transition — station state, live-updating numbers). Motion fires for a
 * data value changing, a station state transitioning, a chart drawing in, or
 * a view switch — never as decorative entrance/hover. Centralised here so
 * every component uses the same curve rather than a slightly different one
 * per file.
 *
 * Spring parameters follow Apple's "Designing Fluid Interfaces" (WWDC 2018)
 * guidance, as translated by the apple-design skill: default UI motion is
 * critically damped (bounce 0, no overshoot) with a 0.3-0.4s response —
 * bounce is reserved for gesture-driven, momentum-carrying interactions,
 * none of which exist in this app (no drag, no flick). A spring, unlike a
 * fixed-duration tween, animates from wherever the value currently sits, so
 * a station that flips state again mid-transition (a real possibility
 * during a live incident) retargets smoothly instead of jumping.
 */
export const EASE_OUT: readonly [number, number, number, number] = [0.16, 1, 0.3, 1];

interface TweenTransition {
  duration: number;
  ease: readonly [number, number, number, number];
}

interface SpringTransition {
  type: 'spring';
  duration: number;
  bounce: number;
}

/** A data value changing (confidence %, cycle time, fill level) — critically
 *  damped so a rapid re-tick during an incident retargets instead of jumping. */
export const VALUE_CHANGE: SpringTransition = { type: 'spring', duration: 0.3, bounce: 0 };

/** A station card transitioning between Measured/Inferred/Degrading/Abstained. */
export const STATE_TRANSITION: SpringTransition = { type: 'spring', duration: 0.4, bounce: 0 };

/** A chart or panel drawing in on first mount — an entrance, not a settle,
 *  so a plain ease-out tween (not a spring) is the right tool. */
export const DRAW_IN: TweenTransition = { duration: 0.4, ease: EASE_OUT };

/** Switching between the app's top-level views. */
export const VIEW_TRANSITION: TweenTransition = { duration: 0.25, ease: EASE_OUT };

/** A layout-affecting size change (expand/collapse). Kept a tween, not a
 *  spring: springs have no fixed settle time, which fights height:auto
 *  measurement, and craft guidance is to avoid casually animating
 *  layout-driving properties as if they were "alive" — this is a UI
 *  disclosure, not a physical object. */
export const EXPAND_COLLAPSE: TweenTransition = { duration: 0.3, ease: EASE_OUT };

/**
 * Staggered mount reveal for a group of like elements appearing together
 * (the station line, a row of cards) — opacity + y, critically damped
 * spring, ~30ms between children. Apply STAGGER_CONTAINER's variants to the
 * parent with `initial="initial" animate="animate"`, and STAGGER_ITEM's to
 * each child (no per-child transition needed — it inherits the container's
 * staggerChildren timing).
 */
export const STAGGER_CONTAINER = {
  initial: {},
  animate: { transition: { staggerChildren: 0.03 } },
};

export const STAGGER_ITEM = {
  initial: { opacity: 0, y: 14 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', duration: 0.5, bounce: 0 } as SpringTransition,
  },
};
