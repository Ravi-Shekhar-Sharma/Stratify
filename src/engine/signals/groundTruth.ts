import { runSimulation, type SimulationConfig, type TickSnapshot } from '../simulation';
import { STATIONS } from '../stations';
import { createRng, jitter } from '../rng';

/**
 * Ground truth: everything really happening at every station, every tick.
 * This is the ONLY module that knows the true cycle time, and the only
 * place true process-value readings are generated. Nothing here is
 * restricted from being imported — the restriction is on what
 * src/engine/inference is allowed to import (see observable.ts), so the
 * separation is enforced at the consumer, not by hiding this module.
 */

export type GroundTruthEventKind = 'entry' | 'exit' | 'andon' | 'blocked' | 'starved';

export interface GroundTruthEvent {
  kind: GroundTruthEventKind;
  vehicleId?: number;
}

export interface StationGroundTruth {
  stationId: string;
  tick: number;
  occupied: boolean;
  vehicleId: number | null;
  /** The real, currently-in-effect cycle time — post-incident, post-jitter. */
  trueCycleSeconds: number;
  elapsedInStation: number;
  blocked: boolean;
  /**
   * Synthetic placeholder reading for stations with a named process value —
   * no physical baseline exists in docs/assumptions.md for torque, humidity,
   * etc., so this is a dimensionless nominal-plus-jitter signal, not a real
   * physical claim. Replace when process-value modeling is actually scoped.
   * undefined for stations with no named process value, and while unoccupied.
   */
  trueProcessValue?: number;
  events: GroundTruthEvent[];
}

export interface GroundTruthTick {
  tick: number;
  stations: StationGroundTruth[];
  bufferLevels: Record<string, number>;
}

export type GroundTruthStream = GroundTruthTick[];

export type GroundTruthConfig = Omit<SimulationConfig, 'onTick'>;

const PROCESS_VALUE_STATION_IDS = new Set(
  STATIONS.filter((s) => s.processValues.length > 0).map((s) => s.id),
);

export function buildGroundTruthStream(config: GroundTruthConfig): GroundTruthStream {
  const stream: GroundTruthTick[] = [];
  // Independent RNG stream for process-value jitter, seeded off the same
  // seed but never shared with the simulation's own rng draws, so adding a
  // process-value reading can never perturb line dynamics.
  const processRng = createRng((config.seed ?? 1) * 2654435761 + 1);

  const prevOccupant = new Map<string, number | null>(STATIONS.map((s) => [s.id, null]));

  const onTick = (snapshot: TickSnapshot) => {
    const eventsByStation = new Map<string, GroundTruthEvent[]>();
    for (const e of snapshot.eventsThisTick) {
      const list = eventsByStation.get(e.stationId) ?? [];
      list.push({ kind: e.kind });
      eventsByStation.set(e.stationId, list);
    }

    const stations: StationGroundTruth[] = snapshot.stations.map((s) => {
      const events = eventsByStation.get(s.id) ?? [];
      const was = prevOccupant.get(s.id) ?? null;
      // Compare vehicle identity, not just occupancy — a station can hand
      // one vehicle off and accept the next in the very same tick (e.g. a
      // takt-paced station finishing exactly as the next admission lands),
      // which a null-vs-non-null diff alone would miss entirely.
      if (was !== s.occupant) {
        if (was !== null) events.unshift({ kind: 'exit', vehicleId: was });
        if (s.occupant !== null) events.push({ kind: 'entry', vehicleId: s.occupant });
      }
      prevOccupant.set(s.id, s.occupant);

      const hasProcessValue = PROCESS_VALUE_STATION_IDS.has(s.id);
      const trueProcessValue =
        hasProcessValue && s.occupant !== null ? 1 + jitter(processRng, 0.08) : undefined;

      return {
        stationId: s.id,
        tick: snapshot.tick,
        occupied: s.occupant !== null,
        vehicleId: s.occupant,
        trueCycleSeconds: s.currentCycleSeconds,
        elapsedInStation: s.elapsed,
        blocked: s.blocked,
        trueProcessValue,
        events,
      };
    });

    stream.push({ tick: snapshot.tick, stations, bufferLevels: snapshot.bufferLevels });
  };

  runSimulation({ ...config, onTick });

  return stream;
}
