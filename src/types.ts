export type StationId =
  | 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
  | 'S6' | 'S7' | 'S8' | 'S9' | 'S10';

export type StationState = 'running' | 'slowing' | 'starved' | 'quality';
export type TagKind = 'MEASURED' | 'INFERRED';
export type BufferLevel = 'normal' | 'filling' | 'draining';

export interface Station {
  id: StationId;
  name: string;
  cycle: number;
  tag: TagKind;
  inferred: boolean;
  confidence?: number;
  state: StationState;
  qualityFlag?: string;
}

export interface BufferState {
  level: BufferLevel;
  /** 0..100 fill for visual */
  fill: number;
  /** 0..100 target fill to animate toward */
  target: number;
}

export type TwinPhase = 'connecting' | 'steady' | 'incident';

export interface EventLine {
  id: number;
  time: string;
  text: string;
  kind: 'info' | 'warn' | 'crit';
}

export interface PredictionState {
  active: boolean;
  headline: string;
  minutesToStarve: number | null;
  carsAtRisk: number | null;
  /** throughput samples for area chart, JPH */
  samples: number[];
}

export interface RecommendationState {
  actions: string[];
  note: string;
}
