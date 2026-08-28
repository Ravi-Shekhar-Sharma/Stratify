import type { Station, StationId } from '@/types';

export const STATION_ORDER: StationId[] = [
  'S1', 'S2', 'S3', 'S4', 'S5',
  'S6', 'S7', 'S8', 'S9', 'S10',
];

export const STATION_NAMES: Record<StationId, string> = {
  S1: 'Wiring',
  S2: 'Cockpit',
  S3: 'Glazing',
  S4: 'Headliner',
  S5: 'Console',
  S6: 'Seats',
  S7: 'Fascia',
  S8: 'Wheels',
  S9: 'Fluids',
  S10: 'EOL Test',
};

/** Cycle times at rest, in seconds. S6 inferred (no sensor). */
export const REST_CYCLES: Record<StationId, number> = {
  S1: 54,
  S2: 52,
  S3: 50,
  S4: 51,
  S5: 56,
  S6: 55,
  S7: 53,
  S8: 49,
  S9: 57,
  S10: 60,
};

export const TAKT_SECONDS = 58;
export const RATE_REST_JPH = 62;
export const RATE_INCIDENT_JPH = 48;
export const FTT_REST = 96.2;
export const FTT_INCIDENT = 94.8;

export const S6_CONFIDENCE_REST = 72;
export const S6_CONFIDENCE_INCIDENT = 86;
export const S6_CONFIDENCE_WITH_SENSOR = 97;

export const S6_CYCLE_INCIDENT = 80;
export const STARVE_MINUTES = 7;
export const CARS_AT_RISK = 14;

/** Steady-state station list. */
export function steadyStations(): Station[] {
  return STATION_ORDER.map((id) => ({
    id,
    name: STATION_NAMES[id],
    cycle: REST_CYCLES[id],
    tag: id === 'S6' ? 'INFERRED' : 'MEASURED',
    inferred: id === 'S6',
    confidence: id === 'S6' ? S6_CONFIDENCE_REST : undefined,
    state: 'running',
  }));
}

/** Mid-level buffer fills between each adjacent pair (9 buffers). */
export const BUFFER_MID = 52;

/** Throughput samples for the area chart, JPH. */
export const REST_SAMPLES = [62, 62, 61, 62, 62, 62, 62, 62];

/** Incident throughput curve: dips during the incident. */
export const INCIDENT_SAMPLES = [62, 62, 61, 55, 49, 48, 48, 48];

export function nowTime(): string {
  const d = new Date();
  return d.toLocaleTimeString('en-GB', { hour12: false });
}
