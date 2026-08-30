/**
 * Prints the ML-related constants from src/engine/assumptions.ts (which
 * mirrors docs/assumptions.md's "## ML modelling choices" section) as JSON
 * on stdout. Python reads these via subprocess instead of hardcoding a
 * second copy — this file plus assumptions.ts together are the single
 * source of truth, not ml/generate.py or ml/validate.py.
 *
 * Usage: npx tsx src/engine/ml/printMlConstants.ts
 */
import {
  CYCLE_TIME_JITTER_FRACTION,
  ALERT_MULTIPLIER,
  MARGINAL_SEVERITY_MULTIPLIER_RANGE,
  EASY_SEVERITY_MULTIPLIER_RANGE,
  S6_NOMINAL_CYCLE_SECONDS,
  S6_DEGRADED_CYCLE_SECONDS,
  SENSORED_CONFIDENCE_CEILING,
  SHIFT_SECONDS,
} from '../assumptions';
import { TAKT_SECONDS } from '../stations';
import { ALERT_MIN_HOLD } from '../inference/alertSignal';

console.log(
  JSON.stringify({
    cycleTimeJitterFraction: CYCLE_TIME_JITTER_FRACTION,
    alertMultiplier: ALERT_MULTIPLIER,
    // Debounce on the alert signal itself (src/engine/inference/alertSignal.ts)
    // — the SAME constant the live UI's classifyStation uses. Printed here
    // so ml/validate.py can report it, not so Python can recompute the
    // alert with it: the actual debounce logic runs in TypeScript (see
    // src/engine/ml/computeAlertColumn.ts), never reimplemented in Python.
    alertMinHold: ALERT_MIN_HOLD,
    marginalSeverityMultiplierRange: MARGINAL_SEVERITY_MULTIPLIER_RANGE,
    easySeverityMultiplierRange: EASY_SEVERITY_MULTIPLIER_RANGE,
    taktSeconds: TAKT_SECONDS,
    s6NominalCycleSeconds: S6_NOMINAL_CYCLE_SECONDS,
    s6DegradedCycleSeconds: S6_DEGRADED_CYCLE_SECONDS,
    sensoredConfidenceCeiling: SENSORED_CONFIDENCE_CEILING,
    // For the plant-manager view's Availability calc (Operating Time /
    // Planned Production Time, ISO 22400-2) — the denominator is the full
    // simulated shift, not re-derived in Python from anything else.
    shiftSeconds: SHIFT_SECONDS,
  }),
);
