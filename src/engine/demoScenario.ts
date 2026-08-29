import { STATIONS, TAKT_SECONDS } from './stations';
import { S6_DEGRADED_CYCLE_SECONDS } from './assumptions';
import type { IncidentInjection } from './simulation';

/**
 * The one demo scenario this app ships with (the "Run Incident" button and
 * the live playback loop), factored out of src/useEngineTwin.ts so both the
 * React hook and any offline measurement script (e.g.
 * src/engine/measureDemoScenario.ts) build the EXACT same stream — no
 * second copy of these numbers to drift out of sync with what a viewer
 * actually sees on screen.
 */

/**
 * Shorter than a full SHIFT_SECONDS (27,000s) purely to keep the live
 * browser demo's memory and precompute cost small — a UI pacing choice, not
 * a modelling assumption. 5,400s (90 simulated minutes) comfortably covers
 * settle time, the demo incident, and its full drain-to-starvation window
 * with runway left over, at roughly 40ms to precompute and ~25MB retained —
 * see docs/assumptions.md for SHIFT_SECONDS itself, which the ML pipeline
 * still uses in full.
 */
export const DEMO_DURATION_SECONDS = 5400;
export const DEMO_SEED = 1;
export const DEMO_JITTER_FRACTION = 0.05;

/**
 * ~50x real time — chosen for recording: at this speed the rest->starvation
 * arc (buffer visibly starts draining to fully starved, measured ~475s of
 * sim time for the shipped demo incident) plays out in ~9.5s on screen, and
 * a fresh "Run Incident" click reaches onset (tick SETTLE_TICKS+100) in
 * ~33s — both cross-checked in src/engine/measureDemoScenario.ts's
 * wall-clock section. The full 90-minute demo shift takes ~108s at this
 * speed if left running to the end.
 */
export const PLAYBACK_TICKS_PER_STEP = 6;
export const PLAYBACK_INTERVAL_MS = 120;
export const PLAYBACK_MULTIPLE = (PLAYBACK_TICKS_PER_STEP * 1000) / PLAYBACK_INTERVAL_MS;

const STATION_INDEX = new Map(STATIONS.map((s, i) => [s.id, i]));

/**
 * Earliest tick an incident may be injected — identical formula to
 * src/engine/ml/exportTrainingRows.ts's SETTLE_TICKS, reused here rather
 * than re-derived: the discrete station chain starts empty and fills up one
 * station per takt, so an incident injected before the trim-to-chassis
 * buffer's consumer (S9) has genuinely been fed produces a warmup artifact,
 * not a real incident consequence — see that file and ml/README.md's
 * "warmup-transient bug" section for how this was diagnosed.
 */
export const SETTLE_TICKS = (STATION_INDEX.get('S9')! + 1) * TAKT_SECONDS;

/** S6, 54s (simulated nominal) -> 80s (docs/assumptions.md's demo incident,
 *  "Degraded cycle: 80 s") — the only incident this app's UI ever injects. */
export const DEMO_INCIDENT: IncidentInjection = {
  stationId: 'S6',
  atTick: SETTLE_TICKS + 100,
  newCycleSeconds: S6_DEGRADED_CYCLE_SECONDS,
};
