/**
 * Constants from docs/assumptions.md not already defined in stations.ts or
 * topology.ts. That file is the sole source of truth for every number here —
 * if it changes, change this to match, never the other way around.
 */

// ## Timing
export const EFFECTIVE_SECONDS_PER_DAY = 2 * 7.5 * 3600; // 54,000
export const SHIFT_SECONDS = 7.5 * 3600; // 27,000 — one of the two shifts
export const DAILY_VOLUME_TARGET = 1000;

// ## The demo incident
/**
 * "Nominal cycle" as printed in the file's demo-incident table. Not used as
 * S6's simulated steady-state cycle — see the note in stations.ts on why the
 * simulation paces S6 at takt until the incident is injected.
 */
export const S6_NOMINAL_CYCLE_SECONDS = 55;
export const S6_DEGRADED_CYCLE_SECONDS = 80;
/**
 * docs/assumptions.md's "Derivation of the 7 minute lead time": net drain
 * rate 1/54 - 1/80 = 0.006019 units/s against the trim-to-chassis buffer's
 * 2.5-unit nominal fill -> 415s, "reported as about 7 minutes." The warning
 * window the demo incident actually delivers before the line would stop.
 */
export const DEMO_LEAD_TIME_SECONDS = 415;

// ## Buffers and work in progress — "elsewhere", i.e. not the two named buffers
export const INTER_STATION_CAPACITY = 2;

// ## Observability tiers
/**
 * The sensored tier's declared max confidence (docs/assumptions.md's
 * "Observability tiers" table: "Sensored | True cycle time, plus process
 * values where applicable | 0.99"). Not baked into soft_sensor.json the
 * way blind/partial's 0.90 ceiling is (ml/model.py's CONFIDENCE_CEILING) —
 * sensored stations never run through the soft sensor at all, they report
 * ground truth directly, so this number has no empirical confidence
 * distribution behind it in metrics.json. It exists here so the trust
 * view's tier comparison and the S6 instrumentation-lift figure can cite
 * it without a second, undocumented copy of "0.99" appearing in either
 * TypeScript or Python.
 */
export const SENSORED_CONFIDENCE_CEILING = 0.99;

// ## ML modelling choices — engineering decisions, not industry-sourced.
// Single source of truth for these two numbers: Python reads them via
// src/engine/ml/printMlConstants.ts rather than hardcoding a second copy.
export const CYCLE_TIME_JITTER_FRACTION = 0.05;
export const ALERT_MULTIPLIER = 1.15;
export const MARGINAL_SEVERITY_MULTIPLIER_RANGE: readonly [number, number] = [1.1, 1.25];
export const EASY_SEVERITY_MULTIPLIER_RANGE: readonly [number, number] = [1.3, 2.0];

// ## Instrumentation cost, for the sensor placement optimiser
/** Hobby-grade sensing, not plant deployable — kept for reference, not used
 *  in the investment case ranking (that uses plant-deployable cost, since
 *  that is what an actual sensor addition would cost). USD. */
export const PROTOTYPE_COST_USD_RANGE: readonly [number, number] = [40, 250];
/** Rated hardware, installation, integration, validation. USD. Labelled an
 *  estimate wherever it appears — docs/assumptions.md's "Pending
 *  verification" section lists this range as unverified as of 2026-08-25. */
export const PLANT_DEPLOYABLE_COST_USD_RANGE: readonly [number, number] = [2000, 4500];
/** Plants permit instrumentation changes only during a small number of
 *  scheduled maintenance windows per year (docs/assumptions.md's
 *  instrumentation-cost section states the constraint but not a count).
 *  4 (quarterly) was confirmed directly by the user on 2026-08-30 for the
 *  investment-case rollout path, absent a plant-specific figure — not a
 *  derived or industry-sourced number. */
export const MAINTENANCE_WINDOWS_PER_YEAR = 4;
