import type { StationSpec, Shop } from '@/engine/types';
import type { StationDisplayState } from '@/engine/inference/stationDisplay';

export type EnginePhase = 'connecting' | 'steady' | 'incident';

export interface StationViewModel {
  spec: StationSpec;
  state: StationDisplayState;
}

export interface BufferViewModel {
  id: string;
  label: string;
  fillPct: number;
  trend: 'normal' | 'filling' | 'draining';
}

export interface EventLine {
  id: number;
  simTick: number;
  text: string;
  kind: 'info' | 'warn' | 'crit';
}

export type Recommendation =
  | { kind: 'nominal' }
  | {
      kind: 'degrading';
      stationId: string;
      stationName: string;
      cycleSeconds: number;
      nominalCycleSeconds: number;
      basis: 'measured' | 'inferred';
      confidence?: number;
      confidenceCeiling: number;
    }
  | { kind: 'abstained'; stationId: string; stationName: string; reason: string };

export interface TwinSnapshot {
  phase: EnginePhase;
  currentTick: number;
  totalTicks: number;
  rateJph: number;
  stations: StationViewModel[];
  buffers: BufferViewModel[];
  /** Trim-chassis buffer fill level (units), most recent last — real
   *  samples from the engine, one per playback step, capped in length. */
  trimBufferHistory: number[];
  /** Seconds until the trim-chassis buffer empties at its CURRENT drain
   *  rate (last two samples), or null if it isn't currently draining. A
   *  live instantaneous estimate, not the fixed worked example in
   *  docs/assumptions.md — it will differ from "about 7 minutes" whenever
   *  the live severity differs from that derivation's 80s canonical case. */
  trimBufferSecondsToEmpty: number | null;
  events: EventLine[];
  recommendation: Recommendation;
  incidentScheduled: boolean;
  playbackMultiple: number;
}

export const SHOP_LABEL: Record<Shop, string> = {
  body: 'Body Construction',
  paint: 'Paint',
  final: 'Final Assembly',
};
