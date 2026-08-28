import { STATIONS, TAKT_SECONDS } from './stations';
import { NAMED_BUFFERS, SEGMENT_ORDER, SEGMENT_STATION_IDS, type NamedBuffer } from './topology';
import { createRng, jitter } from './rng';

/**
 * Discrete-time forward simulation, stepping one second at a time.
 *
 * Two coupled models, matched to how docs/assumptions.md itself treats them:
 *  - Every station is a discrete slot: a vehicle occupies it for its cycle
 *    time, then moves to the next station if that station is free (direct
 *    handoff, no intermediate slot — inter-station WIP elsewhere is "0 to 1
 *    unit," too small to model as a separate buffer). This produces real
 *    blocking: a slow station holds its vehicle, which holds the station
 *    behind it, all the way back to admission.
 *  - The two named buffers (Painted Body Store, trim-to-chassis) are
 *    continuous accumulators, not discrete queues, because the file's own
 *    7-minute derivation is a rate calculation (1/54 - 1/80), and the
 *    trim-to-chassis buffer's 2.5-unit nominal fill is fractional — rounding
 *    it to whole vehicles would move the answer by roughly one drain-rate's
 *    worth of time (~166s), which blows a 30s tolerance outright. Each
 *    buffer's inflow/outflow rate is 1/(bottleneck cycle time of the segment
 *    feeding/draining it), so it responds to a degraded station immediately,
 *    exactly as the file's derivation does.
 */

export interface IncidentInjection {
  stationId: string;
  atTick: number;
  newCycleSeconds: number;
}

export interface SimulationConfig {
  durationSeconds: number;
  seed?: number;
  /** Fractional cycle-time jitter, e.g. 0.02 for +-2%. 0 (default) is deterministic. */
  jitterFraction?: number;
  incidents?: IncidentInjection[];
  /**
   * Called once per tick with the full internal state — this is the sole
   * hook the ground-truth signal layer uses to observe "everything that is
   * really happening." Nothing downstream of this callback is restricted;
   * the restriction (see src/engine/signals) lives in what gets built FROM
   * this data, not in what this simulation exposes.
   */
  onTick?: (snapshot: TickSnapshot) => void;
}

export interface TickStationState {
  id: string;
  occupant: number | null;
  currentCycleSeconds: number;
  elapsed: number;
  blocked: boolean;
}

export interface TickSnapshot {
  tick: number;
  stations: TickStationState[];
  bufferLevels: Record<string, number>;
  eventsThisTick: SimEvent[];
}

export type SimEventKind = 'andon' | 'blocked' | 'starved';

export interface SimEvent {
  tick: number;
  stationId: string;
  kind: SimEventKind;
}

export interface SimulationResult {
  /** Vehicles successfully admitted at the front of the line. */
  vehiclesStarted: number;
  /** Vehicles that exited the last station. Lags vehiclesStarted by one
   *  pipeline-transit time (number of stations x their cycle time). */
  vehiclesCompleted: number;
  events: SimEvent[];
  /** First tick each station was observed starved (no supply), if any. */
  firstStarvedTick: Record<string, number>;
  /** Final level of each named buffer, keyed by buffer id. */
  finalBufferLevels: Record<string, number>;
}

interface RuntimeStation {
  id: string;
  segment: string;
  baseCycleSeconds: number;
  currentCycleSeconds: number;
  occupant: number | null;
  elapsed: number;
  blocked: boolean;
  overrunFlagged: boolean;
}

function stationSegment(stationId: string): string {
  for (const seg of SEGMENT_ORDER) {
    if (SEGMENT_STATION_IDS[seg].includes(stationId)) return seg;
  }
  throw new Error(`Station ${stationId} is not assigned to a segment`);
}

/** The bottleneck (slowest) current cycle time among a segment's stations. */
function segmentBottleneck(stations: RuntimeStation[], segment: string): number {
  let max = 0;
  for (const s of stations) {
    if (s.segment === segment) max = Math.max(max, s.currentCycleSeconds);
  }
  return max;
}

function bufferBoundaryIndex(order: string[], buffer: NamedBuffer): number {
  // Index of the feeder station (buffer.downstreamOf) in line order.
  return order.indexOf(buffer.downstreamOf);
}

export function runSimulation(config: SimulationConfig): SimulationResult {
  const { durationSeconds, seed = 1, jitterFraction = 0, incidents = [], onTick } = config;
  const rng = createRng(seed);

  const order = STATIONS.map((s) => s.id);
  const runtime: RuntimeStation[] = STATIONS.map((s) => ({
    id: s.id,
    segment: stationSegment(s.id),
    baseCycleSeconds: s.nominalCycleSeconds,
    currentCycleSeconds: s.nominalCycleSeconds,
    occupant: null,
    elapsed: 0,
    blocked: false,
    overrunFlagged: false,
  }));
  const byId = new Map(runtime.map((s) => [s.id, s]));

  const bufferLevels = new Map<string, number>(NAMED_BUFFERS.map((b) => [b.id, b.nominalFill]));
  const bufferFeederIndex = new Map<string, number>(
    NAMED_BUFFERS.map((b) => [b.id, bufferBoundaryIndex(order, b)]),
  );

  const events: SimEvent[] = [];
  const firstStarvedTick: Record<string, number> = {};
  let vehiclesStarted = 0;
  let vehiclesCompleted = 0;
  let nextVehicleId = 1;
  let pendingAdmission = false;

  const emit = (tick: number, stationId: string, kind: SimEventKind) => {
    events.push({ tick, stationId, kind });
  };

  for (let tick = 0; tick < durationSeconds; tick++) {
    const eventsBeforeTick = events.length;

    // Apply incidents scheduled for this tick.
    for (const incident of incidents) {
      if (incident.atTick === tick) {
        const station = byId.get(incident.stationId);
        if (!station) throw new Error(`Unknown station in incident: ${incident.stationId}`);
        station.baseCycleSeconds = incident.newCycleSeconds;
      }
    }

    // Advance stations downstream-to-upstream so a station freed this tick
    // can immediately accept the vehicle behind it in the same tick.
    for (let i = order.length - 1; i >= 0; i--) {
      const station = runtime[i];
      station.currentCycleSeconds = Math.max(
        1,
        station.baseCycleSeconds * (1 + jitter(rng, jitterFraction)),
      );

      if (station.occupant === null) continue;

      station.elapsed += 1;

      if (!station.overrunFlagged && station.currentCycleSeconds > TAKT_SECONDS && station.elapsed === TAKT_SECONDS) {
        station.overrunFlagged = true;
        emit(tick, station.id, 'andon');
      }

      if (station.elapsed < station.currentCycleSeconds) continue;

      // Cycle complete — try to move the vehicle forward.
      const isLast = i === order.length - 1;
      const nextStation = isLast ? null : runtime[i + 1];
      const moved = isLast ? true : nextStation!.occupant === null;

      if (moved) {
        const vehicle = station.occupant;
        station.occupant = null;
        station.elapsed = 0;
        station.blocked = false;
        station.overrunFlagged = false;
        if (isLast) {
          vehiclesCompleted += 1;
        } else {
          nextStation!.occupant = vehicle;
          nextStation!.elapsed = 0;
        }
      } else if (!station.blocked) {
        station.blocked = true;
        emit(tick, station.id, 'blocked');
      }
    }

    // Continuous named-buffer levels, driven by the current bottleneck cycle
    // time of the segments each buffer sits between.
    for (const buffer of NAMED_BUFFERS) {
      const feederIdx = bufferFeederIndex.get(buffer.id)!;
      const feederSegment = runtime[feederIdx].segment;
      const receiverStation = byId.get(buffer.upstreamOf)!;
      const receiverSegment = receiverStation.segment;

      const inflowRate = 1 / segmentBottleneck(runtime, feederSegment);
      const outflowRate = 1 / segmentBottleneck(runtime, receiverSegment);

      const prevLevel = bufferLevels.get(buffer.id)!;
      const nextLevel = Math.min(
        buffer.capacity,
        Math.max(0, prevLevel + (inflowRate - outflowRate)),
      );
      bufferLevels.set(buffer.id, nextLevel);

      if (nextLevel <= 0 && firstStarvedTick[buffer.upstreamOf] === undefined) {
        firstStarvedTick[buffer.upstreamOf] = tick;
        emit(tick, buffer.upstreamOf, 'starved');
      }
    }

    // Admission: a new vehicle enters at takt if the front station is free.
    if (tick % TAKT_SECONDS === 0) pendingAdmission = true;
    if (pendingAdmission && runtime[0].occupant === null) {
      runtime[0].occupant = nextVehicleId++;
      runtime[0].elapsed = 0;
      vehiclesStarted += 1;
      pendingAdmission = false;
    }

    if (onTick) {
      onTick({
        tick,
        stations: runtime.map((s) => ({
          id: s.id,
          occupant: s.occupant,
          currentCycleSeconds: s.currentCycleSeconds,
          elapsed: s.elapsed,
          blocked: s.blocked,
        })),
        bufferLevels: Object.fromEntries(bufferLevels),
        eventsThisTick: events.slice(eventsBeforeTick),
      });
    }
  }

  return {
    vehiclesStarted,
    vehiclesCompleted,
    events,
    firstStarvedTick,
    finalBufferLevels: Object.fromEntries(bufferLevels),
  };
}
