import type { GroundTruthStream, GroundTruthTick, StationGroundTruth } from './groundTruth';
import { STATIONS } from '../stations';
import type { ObservabilityTier } from '../types';

/**
 * Observable signals: for each station, only what its observability tier
 * permits to be read. This file is the ONLY place allowed to import
 * groundTruth.ts — src/engine/inference is mechanically forbidden from
 * doing so (see eslint.config.js). Everything downstream of
 * deriveObservableStream sees only the types below.
 *
 * The separation is structural, not conventional: BlindObservable has no
 * property that could hold a cycle time or a process value — reading
 * `.cycleSeconds` off a blind signal is a compile error (the property does
 * not exist on the type), not a runtime check someone has to remember to
 * write. The _proof* constants below turn that claim into something that
 * breaks `npm run typecheck` if it's ever violated, rather than something
 * that just happens to be true today.
 */

export type ObservableEventKind = 'entry' | 'exit' | 'andon' | 'blocked' | 'starved';

export interface ObservableEvent {
  kind: ObservableEventKind;
  vehicleId?: number;
}

interface ObservableBase {
  readonly __observable: true;
  stationId: string;
  tick: number;
}

export interface BlindObservable extends ObservableBase {
  tier: 'blind';
  events: ObservableEvent[];
}

export interface PartialObservable extends ObservableBase {
  tier: 'partial';
  events: ObservableEvent[];
  /** The one process value this tier is permitted. */
  processValue: number | undefined;
}

export interface SensoredObservable extends ObservableBase {
  tier: 'sensored';
  events: ObservableEvent[];
  /** True cycle time — only the sensored tier may expose this. */
  cycleSeconds: number;
  processValue: number | undefined;
}

export type ObservableSignal = BlindObservable | PartialObservable | SensoredObservable;

export interface ObservableTick {
  tick: number;
  stations: ObservableSignal[];
}

export type ObservableStream = ObservableTick[];

// --- Compile-time construction proofs -------------------------------------
// `Extract<keyof T, Forbidden>` is `never` iff none of the forbidden keys
// exist on T. If it isn't `never`, `NoForbiddenKeys<T, F>` becomes `false`,
// and assigning `true` to a `const: false` is a TypeScript error — this
// breaks the build, not a test run.
type NoForbiddenKeys<T, Forbidden extends string> = Extract<keyof T, Forbidden> extends never
  ? true
  : false;

const _blindHasNoCycleOrProcessValue: NoForbiddenKeys<
  BlindObservable,
  'cycleSeconds' | 'processValue'
> = true;
const _partialHasNoCycleTime: NoForbiddenKeys<PartialObservable, 'cycleSeconds'> = true;
void _blindHasNoCycleOrProcessValue;
void _partialHasNoCycleTime;
// ---------------------------------------------------------------------------

const tierByStation = new Map<string, ObservabilityTier>(STATIONS.map((s) => [s.id, s.tier]));

function toObservableEvents(gt: StationGroundTruth): ObservableEvent[] {
  // entry/exit/andon/blocked/starved are all permitted at every tier —
  // "Blind stations emit entry and exit timestamps and events only."
  return gt.events.map((e) => ({ kind: e.kind, vehicleId: e.vehicleId }));
}

function deriveSignal(gt: StationGroundTruth): ObservableSignal {
  const tier = tierByStation.get(gt.stationId);
  if (!tier) throw new Error(`Unknown station: ${gt.stationId}`);
  const events = toObservableEvents(gt);

  switch (tier) {
    case 'blind':
      return { __observable: true, tier, stationId: gt.stationId, tick: gt.tick, events };
    case 'partial':
      return {
        __observable: true,
        tier,
        stationId: gt.stationId,
        tick: gt.tick,
        events,
        processValue: gt.trueProcessValue,
      };
    case 'sensored':
      return {
        __observable: true,
        tier,
        stationId: gt.stationId,
        tick: gt.tick,
        events,
        cycleSeconds: gt.trueCycleSeconds,
        processValue: gt.trueProcessValue,
      };
  }
}

function deriveObservableTick(gt: GroundTruthTick): ObservableTick {
  return { tick: gt.tick, stations: gt.stations.map(deriveSignal) };
}

export function deriveObservableStream(stream: GroundTruthStream): ObservableStream {
  return stream.map(deriveObservableTick);
}
