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
} from '../assumptions';
import { TAKT_SECONDS } from '../stations';

console.log(
  JSON.stringify({
    cycleTimeJitterFraction: CYCLE_TIME_JITTER_FRACTION,
    alertMultiplier: ALERT_MULTIPLIER,
    marginalSeverityMultiplierRange: MARGINAL_SEVERITY_MULTIPLIER_RANGE,
    easySeverityMultiplierRange: EASY_SEVERITY_MULTIPLIER_RANGE,
    taktSeconds: TAKT_SECONDS,
    s6NominalCycleSeconds: S6_NOMINAL_CYCLE_SECONDS,
    s6DegradedCycleSeconds: S6_DEGRADED_CYCLE_SECONDS,
  }),
);
