import type { StationSpec } from '../types';
import { STATIONS } from '../stations';
import { ALERT_MULTIPLIER } from '../assumptions';
import type { VisitTracker } from './liveVisits';
import { buildFeatureVector } from './liveFeatures';
import { predictSoftSensor, CONFIDENCE_FLOOR } from './softSensor';

/**
 * The four states this product's whole trust model is built on
 * (docs/assumptions.md, "Observability tiers" and "Confidence floor"), plus
 * one internal fifth state this module needs but the design vocabulary
 * doesn't: 'pending', for "no inferable data yet" (e.g. the first few
 * ticks of a shift, before a station's neighbours have even completed a
 * visit). Pending is not Abstained — Abstained is a stated methodological
 * refusal with a reason; Pending is a plain data-availability gap with
 * nothing to explain. Rendering the two identically would misrepresent an
 * ordinary startup gap as a permanent limitation.
 */
export type Trend = 'up' | 'down' | 'flat';

export type StationDisplayState =
  | { kind: 'pending' }
  | { kind: 'measured'; cycleSeconds: number; trend: Trend }
  | { kind: 'inferred'; cycleSeconds: number; confidence: number; trend: Trend }
  | {
      kind: 'degrading';
      cycleSeconds: number;
      trend: 'up' | 'down';
      basis: 'measured' | 'inferred';
      confidence?: number;
    }
  | { kind: 'abstained'; reason: string };

function trendOf(current: number, previous: number | undefined): Trend {
  if (previous === undefined) return 'flat';
  if (current > previous + 0.5) return 'up';
  if (current < previous - 0.5) return 'down';
  return 'flat';
}

interface StationIndex {
  order: string[];
  byId: Map<string, StationSpec>;
  indexOf: Map<string, number>;
}

function buildIndex(stations: readonly StationSpec[]): StationIndex {
  return {
    order: stations.map((s) => s.id),
    byId: new Map(stations.map((s) => [s.id, s])),
    indexOf: new Map(stations.map((s, i) => [s.id, i])),
  };
}

function neighbourIds(station: StationSpec, idx: StationIndex): { upstreamId?: string; downstreamId?: string } {
  const i = idx.indexOf.get(station.id)!;
  return { upstreamId: idx.order[i - 1], downstreamId: idx.order[i + 1] };
}

/**
 * docs/assumptions.md's abstention rule: "Blind, adjacent to another blind
 * station... cannot be separated from timing alone... the twin reports no
 * estimate." Checked against the full line order (not just final assembly)
 * so it also applies if a station table edit ever moves a blind station
 * next to another one. Under the CURRENT table (S3, S6, S11, S14, S17,
 * S19), no two blind stations are adjacent, so this path is dormant in the
 * shipped app today — src/engine/inference/__tests__/stationDisplay.test.ts
 * proves it fires correctly against a synthetic table that does have an
 * adjacent pair, so "dormant" is a fact about today's station list, not a
 * gap in the rule itself.
 */
function isBlindAdjacentPair(station: StationSpec, idx: StationIndex): boolean {
  if (station.tier !== 'blind') return false;
  const { upstreamId, downstreamId } = neighbourIds(station, idx);
  const upstreamTier = upstreamId ? idx.byId.get(upstreamId)!.tier : undefined;
  const downstreamTier = downstreamId ? idx.byId.get(downstreamId)!.tier : undefined;
  return upstreamTier === 'blind' || downstreamTier === 'blind';
}

function classifySensored(station: StationSpec, tracker: VisitTracker): StationDisplayState {
  const open = tracker.openVisit(station.id);
  const last = tracker.lastCompleted(station.id);
  const cycleSeconds = open?.cycleSeconds ?? last?.cycleSeconds;
  if (cycleSeconds === undefined) return { kind: 'pending' };

  const previous = tracker.previousCompleted(station.id);
  const trend = trendOf(cycleSeconds, previous?.cycleSeconds);

  if (cycleSeconds >= station.nominalCycleSeconds * ALERT_MULTIPLIER) {
    return { kind: 'degrading', cycleSeconds, trend: trend === 'down' ? 'down' : 'up', basis: 'measured' };
  }
  return { kind: 'measured', cycleSeconds, trend };
}

function classifyInferred(station: StationSpec, tracker: VisitTracker, idx: StationIndex): StationDisplayState {
  if (isBlindAdjacentPair(station, idx)) {
    return {
      kind: 'abstained',
      reason:
        'Adjacent to another blind station — the observed dwell across the pair is a sum and the split between them is unidentifiable from timing alone.',
    };
  }

  const stationIdx = idx.indexOf.get(station.id)!;
  const { upstreamId, downstreamId } = neighbourIds(station, idx);
  // No blind/partial station in the current table sits at a line boundary
  // (first or last index), so this never fires today — guarded anyway
  // rather than risking a crash if the station table is ever edited.
  if (!upstreamId || !downstreamId) return { kind: 'pending' };

  const targetVisit = tracker.lastInferableVisit(station.id, downstreamId);
  if (!targetVisit) return { kind: 'pending' };

  const upstreamVisit = tracker.completedForVehicle(upstreamId, targetVisit.vehicleId);
  const downstreamVisit = tracker.completedForVehicle(downstreamId, targetVisit.vehicleId);
  if (!upstreamVisit || !downstreamVisit) return { kind: 'pending' };

  const prediction = predictSoftSensor(
    buildFeatureVector(station, stationIdx, targetVisit, upstreamVisit, downstreamVisit),
  );

  if (prediction.confidence < CONFIDENCE_FLOOR) {
    return {
      kind: 'abstained',
      reason: `Calibrated confidence ${(prediction.confidence * 100).toFixed(0)}% is below the ${(
        CONFIDENCE_FLOOR * 100
      ).toFixed(0)}% floor documented in docs/assumptions.md — declining to report rather than guess.`,
    };
  }

  // Trend: compare against the previous VISIT that was itself inferable
  // (same same-vehicle-neighbour rule), not just the previous completed
  // visit, so the comparison is always apples-to-apples.
  const history = tracker.completedVisits(station.id);
  const targetPos = history.indexOf(targetVisit);
  let trend: Trend = 'flat';
  for (let i = targetPos - 1; i >= 0; i--) {
    const candidate = history[i];
    const candUp = tracker.completedForVehicle(upstreamId, candidate.vehicleId);
    const candDown = tracker.completedForVehicle(downstreamId, candidate.vehicleId);
    if (candUp && candDown) {
      const candPrediction = predictSoftSensor(
        buildFeatureVector(station, stationIdx, candidate, candUp, candDown),
      );
      trend = trendOf(prediction.cycleTimeSeconds, candPrediction.cycleTimeSeconds);
      break;
    }
  }

  if (prediction.cycleTimeSeconds >= station.nominalCycleSeconds * ALERT_MULTIPLIER) {
    return {
      kind: 'degrading',
      cycleSeconds: prediction.cycleTimeSeconds,
      trend: trend === 'down' ? 'down' : 'up',
      basis: 'inferred',
      confidence: prediction.confidence,
    };
  }

  return {
    kind: 'inferred',
    cycleSeconds: prediction.cycleTimeSeconds,
    confidence: prediction.confidence,
    trend,
  };
}

/**
 * `stations` defaults to the real 42-station table and only needs to be
 * overridden in tests that exercise station-table-shape edge cases (like
 * the adjacent-blind-pair rule) the current table doesn't happen to hit.
 */
export function classifyStation(
  station: StationSpec,
  tracker: VisitTracker,
  stations: readonly StationSpec[] = STATIONS,
): StationDisplayState {
  const idx = buildIndex(stations);
  return station.tier === 'sensored' ? classifySensored(station, tracker) : classifyInferred(station, tracker, idx);
}
