/**
 * Debounces the Abstained <-> Inferred display transition against a
 * confidence signal that — measured directly, see
 * src/engine/measureDemoScenario.ts's output — does not move as a clean
 * step function even during a genuine incident. It jumps between a handful
 * of isotonic-calibration plateau values (the calibration map is
 * piecewise-constant), and REST and INCIDENT visits can land on the SAME
 * plateau values; what differs between them is how OFTEN each plateau is
 * hit, not a value either regime is exclusive to. A per-visit floor
 * comparison alone therefore flickers constantly at rest (measured: rest
 * confidence exceeds the 0.60 floor on roughly a third to half of visits,
 * station-dependent).
 *
 * This is a classic Schmitt trigger: a candidate regime only registers once
 * confidence clears the floor by `margin` in either direction (values
 * inside the dead band change nothing), and a candidate only becomes the
 * displayed regime once it has been the candidate for `minHold` CONSECUTIVE
 * inferable visits in a row. Both `margin` and `minHold` are picked from
 * measured rest/incident data (see DEFAULT_HYSTERESIS_CONFIG below and
 * ml/README.md-style reporting in measureDemoScenario.ts's output) — not
 * guessed, and not a change to CONFIDENCE_FLOOR itself, which is untouched
 * and still the number docs/assumptions.md documents as the abstention
 * threshold. This only controls how long a crossing must persist before the
 * DISPLAY commits to it.
 */
export type ConfidenceRegime = 'abstained' | 'inferred';

export interface HysteresisConfig {
  floor: number;
  margin: number;
  minHold: number;
}

/**
 * margin=0.10 (candidate thresholds 0.50 / 0.70 around the 0.60 floor) and
 * minHold=3, chosen from src/engine/measureDemoScenario.ts's measured
 * output against the shipped soft_sensor.json:
 *  - Rest confidence for all 6 blind stations, full-shift no-incident run:
 *    the longest run of consecutive visits at or above 0.70 seen at rest
 *    was 2 (S6); 3 has never been observed at rest across ~60-74 samples
 *    per station.
 *  - The demo incident (S6, 55->80s): confidence reaches 3 consecutive
 *    visits at or above 0.70 within 4 visits of onset, and every observed
 *    post-onset dip stays above 0.50 (the lowest isotonic plateau observed
 *    anywhere, rest or incident, is ~0.558) — so once the incident commits
 *    the display to Inferred, no measured post-onset dip is low enough to
 *    even register as an Abstained candidate under this margin.
 * Re-derive both constants from fresh measureDemoScenario.ts output if
 * soft_sensor.json is ever retrained — they are fit to this artifact's
 * actual confidence distribution, not a general-purpose default.
 */
export const DEFAULT_HYSTERESIS_CONFIG: HysteresisConfig = {
  floor: 0.6,
  margin: 0.1,
  minHold: 3,
};

/** No dead band, no hold — commits to whichever side of the floor the very
 *  latest visit lands on. Used as the "before" baseline when reporting how
 *  much hysteresis reduces flip frequency. */
export const NO_HYSTERESIS_CONFIG: HysteresisConfig = {
  floor: 0.6,
  margin: 0,
  minHold: 1,
};

/**
 * Resolves the currently-displayed regime from an ordered sequence of
 * calibrated confidence values (oldest first). Pure function of the whole
 * sequence — no external state — so both the live classifier and this
 * measurement script get identical, independently-checkable results from
 * the same inputs.
 */
export function resolveConfidenceRegime(
  confidences: readonly number[],
  config: HysteresisConfig = DEFAULT_HYSTERESIS_CONFIG,
): ConfidenceRegime {
  if (confidences.length === 0) {
    throw new Error('resolveConfidenceRegime: requires at least one confidence value');
  }
  const { floor, margin, minHold } = config;
  const upperThreshold = floor + margin;
  const lowerThreshold = floor - margin;

  let regime: ConfidenceRegime = confidences[0] >= upperThreshold ? 'inferred' : 'abstained';
  let pendingRegime: ConfidenceRegime | null = null;
  let pendingCount = 0;

  for (let i = 1; i < confidences.length; i++) {
    const c = confidences[i];
    const candidate: ConfidenceRegime | null =
      c >= upperThreshold ? 'inferred' : c <= lowerThreshold ? 'abstained' : null;

    if (candidate === null || candidate === regime) {
      pendingRegime = null;
      pendingCount = 0;
      continue;
    }

    if (pendingRegime === candidate) pendingCount++;
    else {
      pendingRegime = candidate;
      pendingCount = 1;
    }

    if (pendingCount >= minHold) {
      regime = candidate;
      pendingRegime = null;
      pendingCount = 0;
    }
  }

  return regime;
}

/** Full regime sequence (one per input confidence), for measuring flip
 *  counts over a run rather than just the final state. */
export function resolveConfidenceRegimeSequence(
  confidences: readonly number[],
  config: HysteresisConfig = DEFAULT_HYSTERESIS_CONFIG,
): ConfidenceRegime[] {
  return confidences.map((_, i) => resolveConfidenceRegime(confidences.slice(0, i + 1), config));
}

export function countFlips(regimes: readonly ConfidenceRegime[]): number {
  let flips = 0;
  for (let i = 1; i < regimes.length; i++) if (regimes[i] !== regimes[i - 1]) flips++;
  return flips;
}
