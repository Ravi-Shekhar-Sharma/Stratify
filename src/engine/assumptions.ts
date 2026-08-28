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

// ## Buffers and work in progress — "elsewhere", i.e. not the two named buffers
export const INTER_STATION_CAPACITY = 2;
