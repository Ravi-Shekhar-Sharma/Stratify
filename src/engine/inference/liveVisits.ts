import type { ObservableTick } from '../signals/observable';

/**
 * One station visit as it can be reconstructed from OBSERVABLE signals only
 * — the inference-layer counterpart of src/engine/ml/visits.ts's Visit,
 * which needs ground truth for the training label (trueCycleSeconds) and is
 * therefore off-limits here (see eslint.config.js). Entry/exit timestamps
 * and events are legitimately observable at every tier, so dwell, transit,
 * and event-flag features can all be computed without ever touching a
 * hidden value. `cycleSeconds` is the one field that isn't always knowable:
 * present only when the station is 'sensored' (that tier's ObservableSignal
 * exposes it directly), used purely for that tier's own "measured" display,
 * never fed into the soft sensor as a neighbour feature.
 */
export interface ObservableVisit {
  stationId: string;
  vehicleId: number;
  entryTick: number;
  exitTick: number;
  hadAndon: boolean;
  hadBlocked: boolean;
  hadStarved: boolean;
  processValue?: number;
  cycleSeconds?: number;
}

interface OpenVisit {
  vehicleId: number;
  entryTick: number;
  hadAndon: boolean;
  hadBlocked: boolean;
  hadStarved: boolean;
  processValue?: number;
  cycleSeconds?: number;
}

/**
 * Consumes an ObservableStream one tick at a time (rather than replaying a
 * whole stream from the start on every read) so a live playhead can advance
 * tick-by-tick at O(1) amortized cost instead of O(playhead position) per
 * frame. Mirrors extractVisits' event-handling logic exactly, just applied
 * incrementally instead of over Array.prototype.
 */
export class VisitTracker {
  private open = new Map<string, OpenVisit>();
  private completedByStation = new Map<string, ObservableVisit[]>();
  private completedByStationVehicle = new Map<string, Map<number, ObservableVisit>>();
  private latestBufferLevels: Record<string, number> = {};
  private latestTick = -1;

  get currentTick(): number {
    return this.latestTick;
  }

  get bufferLevels(): Readonly<Record<string, number>> {
    return this.latestBufferLevels;
  }

  applyTick(tick: ObservableTick): void {
    this.latestTick = tick.tick;
    this.latestBufferLevels = tick.bufferLevels;

    for (const signal of tick.stations) {
      const stationId = signal.stationId;
      const processValue = 'processValue' in signal ? signal.processValue : undefined;
      const cycleSeconds = 'cycleSeconds' in signal ? signal.cycleSeconds : undefined;

      for (const event of signal.events) {
        if (event.kind === 'entry') {
          this.open.set(stationId, {
            vehicleId: event.vehicleId!,
            entryTick: signal.tick,
            hadAndon: false,
            hadBlocked: false,
            hadStarved: false,
            processValue,
            cycleSeconds,
          });
        }
        if (event.kind === 'exit') {
          const v = this.open.get(stationId);
          if (v && v.vehicleId === event.vehicleId) {
            const completed: ObservableVisit = { stationId, exitTick: signal.tick, ...v };
            const list = this.completedByStation.get(stationId) ?? [];
            list.push(completed);
            this.completedByStation.set(stationId, list);

            const byVehicle = this.completedByStationVehicle.get(stationId) ?? new Map();
            byVehicle.set(completed.vehicleId, completed);
            this.completedByStationVehicle.set(stationId, byVehicle);

            this.open.delete(stationId);
          }
        }
      }

      const stillOpen = this.open.get(stationId);
      if (stillOpen) {
        for (const event of signal.events) {
          if (event.kind === 'andon') stillOpen.hadAndon = true;
          if (event.kind === 'blocked') stillOpen.hadBlocked = true;
          if (event.kind === 'starved') stillOpen.hadStarved = true;
        }
        if (processValue !== undefined) stillOpen.processValue = processValue;
        // cycleSeconds is deliberately captured once, at entry, and never
        // refreshed here — it mirrors ml/ml/visits.ts's extractVisits,
        // which reads trueCycleSeconds from the entry-tick snapshot only.
        // The simulation resamples a station's currentCycleSeconds every
        // tick (jitter), so overwriting this on later ticks would make a
        // completed visit's cycleSeconds reflect its LAST tick rather than
        // the value in effect when the vehicle entered.
      }
    }
  }

  /** All completed visits at a station, oldest first. */
  completedVisits(stationId: string): readonly ObservableVisit[] {
    return this.completedByStation.get(stationId) ?? [];
  }

  /** The most recently completed visit at a station, if any. */
  lastCompleted(stationId: string): ObservableVisit | undefined {
    const list = this.completedByStation.get(stationId);
    return list && list.length > 0 ? list[list.length - 1] : undefined;
  }

  /** The second-most-recently completed visit — used for trend direction. */
  previousCompleted(stationId: string): ObservableVisit | undefined {
    const list = this.completedByStation.get(stationId);
    return list && list.length > 1 ? list[list.length - 2] : undefined;
  }

  /** A visit currently in progress at a station (not yet exited), if any. */
  openVisit(stationId: string): Readonly<OpenVisit> | undefined {
    return this.open.get(stationId);
  }

  /** The completed visit for a specific vehicle at a station, if it has
   *  completed. Used to join a target station's visit against its immediate
   *  neighbours' visits for the SAME vehicle, exactly as ml/exportTrainingRows.ts
   *  does for training rows — using a different vehicle's neighbour data
   *  here would feed the model features it was never trained to expect. */
  completedForVehicle(stationId: string, vehicleId: number): ObservableVisit | undefined {
    return this.completedByStationVehicle.get(stationId)?.get(vehicleId);
  }

  /**
   * The most recent visit at `stationId` whose downstream counterpart (same
   * vehicle, at `downstreamId`) has ALSO completed. Deliberately more
   * conservative than `lastCompleted`: the soft sensor's downstream features
   * (downstreamDwellSeconds, downstreamAndon, ...) require that visit to
   * exist, and a real downstream visit only completes strictly after the
   * target's own — so a genuinely live system cannot finalise a station's
   * estimate for a given vehicle until the next station has finished with
   * it either. That is a real, honest reporting lag, not a defect; it is
   * why the displayed inferred value is "as of vehicle N," not "as of now."
   */
  lastInferableVisit(stationId: string, downstreamId: string): ObservableVisit | undefined {
    const list = this.completedByStation.get(stationId);
    if (!list) return undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      const candidate = list[i];
      if (this.completedForVehicle(downstreamId, candidate.vehicleId)) return candidate;
    }
    return undefined;
  }
}
