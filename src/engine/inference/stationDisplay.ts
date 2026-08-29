import type { StationSpec } from '../types';
import { STATIONS } from '../stations';
import { ALERT_MULTIPLIER } from '../assumptions';
import type { VisitTracker, ObservableVisit } from './liveVisits';
import { buildFeatureVector } from './liveFeatures';
import { predictSoftSensor, CONFIDENCE_FLOOR, type SoftSensorPrediction } from './softSensor';
import { resolveConfidenceRegimeSequence, DEFAULT_HYSTERESIS_CONFIG } from './confidenceHysteresis';
import { resolveAlertSequence } from './alertSignal';
import { heldConfidence } from './confidenceDisplay';

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

// Every inferable visit's prediction is invariant once its neighbours have
// completed — memoized per visit object (stable identity, never mutated
// after VisitTracker pushes it) so a long-running playback doesn't
// recompute predictions for old visits on every tick as history grows.
const predictionCache = new WeakMap<ObservableVisit, SoftSensorPrediction>();

function predictFor(
  station: StationSpec,
  stationIdx: number,
  target: ObservableVisit,
  upstream: ObservableVisit,
  downstream: ObservableVisit,
): SoftSensorPrediction {
  const cached = predictionCache.get(target);
  if (cached) return cached;
  const prediction = predictSoftSensor(buildFeatureVector(station, stationIdx, target, upstream, downstream));
  predictionCache.set(target, prediction);
  return prediction;
}

/** Every inferable visit's prediction for a station, oldest first — the
 *  full sequence the confidence-hysteresis regime is resolved from. */
function inferablePredictions(
  station: StationSpec,
  stationIdx: number,
  tracker: VisitTracker,
  upstreamId: string,
  downstreamId: string,
): SoftSensorPrediction[] {
  const predictions: SoftSensorPrediction[] = [];
  for (const visit of tracker.completedVisits(station.id)) {
    const downstream = tracker.completedForVehicle(downstreamId, visit.vehicleId);
    if (!downstream) continue;
    const upstream = tracker.completedForVehicle(upstreamId, visit.vehicleId);
    if (!upstream) continue;
    predictions.push(predictFor(station, stationIdx, visit, upstream, downstream));
  }
  return predictions;
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

  const predictions = inferablePredictions(station, stationIdx, tracker, upstreamId, downstreamId);
  if (predictions.length === 0) return { kind: 'pending' };

  const latest = predictions[predictions.length - 1];
  const previous = predictions.length > 1 ? predictions[predictions.length - 2] : undefined;
  const trend = trendOf(latest.cycleTimeSeconds, previous?.cycleTimeSeconds);

  const cycleSeq = predictions.map((p) => p.cycleTimeSeconds);
  const confSeq = predictions.map((p) => p.confidence);

  // The bottleneck/degrading alert — the SAME trigger the evidence's S6->S9
  // lead-time metric uses (predicted cycle >= nominal*ALERT_MULTIPLIER, a
  // light debounce only, no confidence gate anywhere). This must fire and
  // resolve independently of the confidence-trust regime below: gating it
  // on confidence hysteresis previously delayed the on-screen warning by
  // ~6 minutes relative to the ~455-500s lead time the evidence claims —
  // measured directly, see measureDemoScenario.ts's "Cycle-time alert
  // signal" section.
  const alertThreshold = station.nominalCycleSeconds * ALERT_MULTIPLIER;
  const alertSeq = resolveAlertSequence(cycleSeq, alertThreshold);
  const alertActive = alertSeq[alertSeq.length - 1];

  // Confidence-hysteresis regime — used ONLY to decide Abstained vs
  // Inferred at rest (never to gate the alert above). Confidence alone
  // flickers across the 0.60 floor almost every other visit even at
  // genuine rest — measured directly, see measureDemoScenario.ts.
  // resolveConfidenceRegime debounces that DISPLAY transition (dead band +
  // minimum consecutive hold); it never changes CONFIDENCE_FLOOR itself or
  // what an individual visit's own confidence is.
  const regimeSeq = resolveConfidenceRegimeSequence(confSeq, DEFAULT_HYSTERESIS_CONFIG);
  const trustRegime = regimeSeq[regimeSeq.length - 1];

  // Whatever a viewer would consider "a number worth showing" at each past
  // point — either the alert is active, or the trust regime has committed
  // to Inferred. heldConfidence rides the running max of confidence over
  // the current unbroken run of this, so the displayed number reads as
  // stable/rising through an episode instead of bouncing across the raw
  // isotonic-calibration plateaus (display-only — never changes the
  // stored per-visit confidence itself).
  const isNumericSeq = alertSeq.map((active, i) => active || regimeSeq[i] === 'inferred');

  if (alertActive) {
    return {
      kind: 'degrading',
      cycleSeconds: latest.cycleTimeSeconds,
      trend: trend === 'down' ? 'down' : 'up',
      basis: 'inferred',
      confidence: heldConfidence(confSeq, isNumericSeq),
    };
  }

  if (trustRegime === 'abstained') {
    const floorPct = (CONFIDENCE_FLOOR * 100).toFixed(0);
    const latestPct = (latest.confidence * 100).toFixed(0);
    // The latest single visit's confidence can be ABOVE the floor while the
    // DISPLAY still reads Abstained — the hold requirement (see
    // confidenceHysteresis.ts) hasn't yet seen enough consecutive
    // above-floor visits to commit the display to Inferred. Saying so
    // honestly here matters: claiming "confidence 81% is below the 60%
    // floor" would be a false, confusing statement the moment this can
    // happen, and it does happen (measured directly during the demo
    // incident's approach to onset).
    const reason =
      latest.confidence >= CONFIDENCE_FLOOR
        ? `Calibrated confidence just crossed above the ${floorPct}% floor (currently ${latestPct}%) but hasn't held for ${DEFAULT_HYSTERESIS_CONFIG.minHold} consecutive visits yet — waiting for a sustained signal before reporting.`
        : `Calibrated confidence ${latestPct}% is below the ${floorPct}% floor documented in docs/assumptions.md — declining to report rather than guess.`;
    return { kind: 'abstained', reason };
  }

  return {
    kind: 'inferred',
    cycleSeconds: latest.cycleTimeSeconds,
    confidence: heldConfidence(confSeq, isNumericSeq),
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
