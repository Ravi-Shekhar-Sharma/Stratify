import type { StationSpec } from '../types';
import type { ObservableVisit } from './liveVisits';
import {
  MISSING_BUFFER_SENTINEL,
  MISSING_PROCESS_VALUE_SENTINEL,
  type SoftSensorFeatures,
} from './softSensor';

/**
 * Builds the exact feature vector ml/train.py fit the soft sensor on, from
 * three joined observable visits (target + its immediate upstream and
 * downstream neighbours, same vehicle) — the live-serving mirror of
 * ml/exportTrainingRows.ts's per-row feature computation. Field-for-field
 * identical to that file's TrainingRow construction; see it for the
 * original derivation and comments on each feature's meaning.
 *
 * `bufferLevelAtEntry` is hardcoded to the missing-buffer sentinel: per
 * ml/README.md, none of the current blind/partial target stations sit
 * immediately downstream of either named buffer, so this feature is empty
 * for every real training row too — this isn't an approximation, it's the
 * same true value training used.
 */
export function buildFeatureVector(
  station: StationSpec,
  stationIndexInLine: number,
  target: ObservableVisit,
  upstream: ObservableVisit,
  downstream: ObservableVisit,
): SoftSensorFeatures {
  return {
    stationIndexInLine,
    isPartialTier: station.tier === 'partial' ? 1 : 0,
    upstreamDwellSeconds: upstream.exitTick - upstream.entryTick,
    upstreamTransitSeconds: target.entryTick - upstream.exitTick,
    downstreamDwellSeconds: downstream.exitTick - downstream.entryTick,
    downstreamTransitSeconds: downstream.entryTick - target.exitTick,
    targetAndon: target.hadAndon ? 1 : 0,
    targetBlocked: target.hadBlocked ? 1 : 0,
    upstreamAndon: upstream.hadAndon ? 1 : 0,
    upstreamBlocked: upstream.hadBlocked ? 1 : 0,
    downstreamAndon: downstream.hadAndon ? 1 : 0,
    downstreamBlocked: downstream.hadBlocked ? 1 : 0,
    downstreamStarved: downstream.hadStarved ? 1 : 0,
    bufferLevelAtEntry: MISSING_BUFFER_SENTINEL,
    targetProcessValue: target.processValue ?? MISSING_PROCESS_VALUE_SENTINEL,
  };
}
