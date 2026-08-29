import type { GroundTruthStream } from '../signals/groundTruth';

/**
 * A single station visit: one vehicle's continuous occupancy of one station,
 * from the tick it entered to the tick it exited. This is the line-model
 * knowledge the ML pipeline needs — Python must not re-derive it, since
 * doing so from raw ticks would be a second implementation of the line's
 * timing semantics, and the two would drift.
 */
export interface Visit {
  stationId: string;
  vehicleId: number;
  entryTick: number;
  exitTick: number;
  /** True cycle time in effect at entry — the training label. */
  trueCycleSeconds: number;
  hadAndon: boolean;
  hadBlocked: boolean;
  hadStarved: boolean;
  /** Last true process-value reading observed during this visit, if the
   *  station has one and a reading occurred (readings require occupancy,
   *  and there's no reading in the very first tick before the ground-truth
   *  builder records one). undefined for stations with no named process
   *  value at all. */
  processValue?: number;
}

/**
 * Walks a ground truth stream once and returns every completed visit per
 * station, in entry order. A visit still occupied when the stream ends is
 * dropped (incomplete — no exit tick), same as it would be truncated data.
 */
export function extractVisits(stream: GroundTruthStream): Map<string, Visit[]> {
  const visitsByStation = new Map<string, Visit[]>();
  const open = new Map<string, Visit & { entryTick: number }>();

  for (const tick of stream) {
    for (const s of tick.stations) {
      const current = open.get(s.stationId);

      for (const event of s.events) {
        if (event.kind === 'entry') {
          open.set(s.stationId, {
            stationId: s.stationId,
            vehicleId: event.vehicleId!,
            entryTick: s.tick,
            exitTick: -1,
            trueCycleSeconds: s.trueCycleSeconds,
            hadAndon: false,
            hadBlocked: false,
            hadStarved: false,
            processValue: s.trueProcessValue,
          });
        }
        if (event.kind === 'exit') {
          const v = open.get(s.stationId);
          if (v && v.vehicleId === event.vehicleId) {
            v.exitTick = s.tick;
            const list = visitsByStation.get(s.stationId) ?? [];
            list.push({ ...v });
            visitsByStation.set(s.stationId, list);
            open.delete(s.stationId);
          }
        }
      }

      // Events other than entry/exit, and the running process-value
      // reading, apply to whichever visit is currently open at this
      // station this tick (there can be at most one).
      const stillOpen = open.get(s.stationId);
      if (stillOpen && current) {
        for (const event of s.events) {
          if (event.kind === 'andon') stillOpen.hadAndon = true;
          if (event.kind === 'blocked') stillOpen.hadBlocked = true;
          if (event.kind === 'starved') stillOpen.hadStarved = true;
        }
        if (s.trueProcessValue !== undefined) stillOpen.processValue = s.trueProcessValue;
      }
    }
  }

  return visitsByStation;
}
