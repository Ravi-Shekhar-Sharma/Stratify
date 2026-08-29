/**
 * TypeScript half of "Python trains, TypeScript serves": reads the JSON
 * artifact ml/artifacts/soft_sensor.json (a GradientBoostingRegressor point
 * estimate, a [q10, q90] interval pair, and an isotonic confidence
 * calibration map, all fitted by ml/train.py) and reproduces its prediction
 * math with no Python dependency at runtime.
 *
 * Every function here mirrors one in ml/model.py by name and shape
 * (predictPoint <-> predict_point, predictInterval <-> predict_interval,
 * predictRawConfidence <-> predict_raw_confidence, applyIsotonic <->
 * apply_isotonic, predictCalibratedConfidence <-> predict_calibrated_
 * confidence) so a diff between the two files is easy to audit by eye.
 * src/engine/inference/__tests__/parity.test.ts asserts both paths agree to
 * within 1e-6 on a fixed set of real inputs - see that file for why this
 * guarantee matters for what the app displays.
 */
import artifactJson from '../../../ml/artifacts/soft_sensor.json';

export interface SoftSensorFeatures {
  stationIndexInLine: number;
  isPartialTier: number;
  upstreamDwellSeconds: number;
  upstreamTransitSeconds: number;
  downstreamDwellSeconds: number;
  downstreamTransitSeconds: number;
  targetAndon: number;
  targetBlocked: number;
  upstreamAndon: number;
  upstreamBlocked: number;
  downstreamAndon: number;
  downstreamBlocked: number;
  downstreamStarved: number;
  bufferLevelAtEntry: number;
  targetProcessValue: number;
}

interface ExportedTree {
  feature: number[];
  threshold: number[];
  childrenLeft: number[];
  childrenRight: number[];
  value: number[];
}

interface ExportedEnsemble {
  learningRate: number;
  initValue: number;
  trees: ExportedTree[];
}

interface CalibrationMap {
  xThresholds: number[];
  yThresholds: number[];
  toleranceSeconds: number;
  toleranceDerivation: string;
  fitRows: number;
}

interface SoftSensorArtifact {
  featureNames: string[];
  missingBufferSentinel: number;
  missingProcessValueSentinel: number;
  targetStations: string[];
  confidenceCeiling: number;
  confidenceFloor: number;
  confidenceReferenceWidthLowSeconds: number;
  confidenceReferenceWidthHighSeconds: number;
  pointEstimate: ExportedEnsemble;
  quantileLow: ExportedEnsemble & { alpha: number };
  quantileHigh: ExportedEnsemble & { alpha: number };
  confidenceCalibration: CalibrationMap;
}

// Cast rather than let TS structurally widen the imported JSON: the shape
// is asserted by parity.test.ts, not by the type system.
const ARTIFACT = artifactJson as unknown as SoftSensorArtifact;

// Reads feature order from the artifact itself (ml/train.py's
// sensor.FEATURES, exported verbatim as "featureNames") rather than
// hardcoding a second copy here - if the two ever disagree on order, this
// throws at first use instead of silently feeding features to the wrong
// tree split.
const FEATURE_ORDER = ARTIFACT.featureNames as (keyof SoftSensorFeatures)[];

function toVector(features: SoftSensorFeatures): number[] {
  return FEATURE_ORDER.map((name) => {
    const value = features[name];
    if (value === undefined) {
      throw new Error(
        `softSensor: missing feature "${name}" required by ml/artifacts/soft_sensor.json's featureNames`
      );
    }
    return value;
  });
}

/** Walks one exported tree to its leaf. Mirrors ml/model.py's
 * _tree_predict_vectorized, specialised to a single row since inference
 * here runs one station visit at a time rather than a batch. */
function walkTree(tree: ExportedTree, x: number[]): number {
  let node = 0;
  while (tree.childrenLeft[node] !== -1) {
    node =
      x[tree.feature[node]] <= tree.threshold[node]
        ? tree.childrenLeft[node]
        : tree.childrenRight[node];
  }
  return tree.value[node];
}

function predictEnsemble(ensemble: ExportedEnsemble, x: number[]): number {
  let total = ensemble.initValue;
  for (const tree of ensemble.trees) {
    total += ensemble.learningRate * walkTree(tree, x);
  }
  return total;
}

export function predictPoint(features: SoftSensorFeatures): number {
  return predictEnsemble(ARTIFACT.pointEstimate, toVector(features));
}

export function predictInterval(features: SoftSensorFeatures): { low: number; high: number } {
  const x = toVector(features);
  return {
    low: predictEnsemble(ARTIFACT.quantileLow, x),
    high: predictEnsemble(ARTIFACT.quantileHigh, x),
  };
}

export function predictRawConfidence(low: number, high: number): number {
  const width = Math.max(high - low, 0);
  const refLow = ARTIFACT.confidenceReferenceWidthLowSeconds;
  const refHigh = ARTIFACT.confidenceReferenceWidthHighSeconds;
  const span = refHigh - refLow;
  const normalized = span > 0 ? Math.min(Math.max((width - refLow) / span, 0), 1) : 0;
  return ARTIFACT.confidenceCeiling * (1 - normalized);
}

/** Reproduces sklearn.isotonic.IsotonicRegression(out_of_bounds='clip')
 * .predict() from its exported (xThresholds, yThresholds): piecewise-linear
 * interpolation within the fitted domain, clipped to the boundary value
 * outside it - the same numpy.interp call ml/model.py's apply_isotonic
 * makes, done here with a binary search since xThresholds is sorted
 * strictly ascending (sklearn's fitted PAVA thresholds have no duplicate
 * x values). */
function applyIsotonic(map: CalibrationMap, raw: number): number {
  const { xThresholds: xt, yThresholds: yt } = map;
  if (raw <= xt[0]) return yt[0];
  if (raw >= xt[xt.length - 1]) return yt[yt.length - 1];

  let lo = 0;
  let hi = xt.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xt[mid] <= raw) lo = mid;
    else hi = mid;
  }
  const x0 = xt[lo];
  const x1 = xt[hi];
  const y0 = yt[lo];
  const y1 = yt[hi];
  if (x1 === x0) return y0;
  return y0 + ((y1 - y0) * (raw - x0)) / (x1 - x0);
}

export function predictCalibratedConfidence(low: number, high: number): number {
  const raw = predictRawConfidence(low, high);
  return applyIsotonic(ARTIFACT.confidenceCalibration, raw);
}

export interface SoftSensorPrediction {
  cycleTimeSeconds: number;
  intervalLowSeconds: number;
  intervalHighSeconds: number;
  rawConfidence: number;
  confidence: number;
}

/** The one call site the app should actually use: point estimate plus
 * calibrated confidence, both derived from the same interval so they can
 * never disagree with each other about how wide the prediction interval was. */
export function predictSoftSensor(features: SoftSensorFeatures): SoftSensorPrediction {
  const cycleTimeSeconds = predictPoint(features);
  const { low, high } = predictInterval(features);
  const rawConfidence = predictRawConfidence(low, high);
  const confidence = applyIsotonic(ARTIFACT.confidenceCalibration, rawConfidence);
  return {
    cycleTimeSeconds,
    intervalLowSeconds: low,
    intervalHighSeconds: high,
    rawConfidence,
    confidence,
  };
}

export const MISSING_BUFFER_SENTINEL = ARTIFACT.missingBufferSentinel;
export const MISSING_PROCESS_VALUE_SENTINEL = ARTIFACT.missingProcessValueSentinel;
export const SOFT_SENSOR_TARGET_STATIONS = ARTIFACT.targetStations;
export const CONFIDENCE_CEILING = ARTIFACT.confidenceCeiling;
export const CONFIDENCE_FLOOR = ARTIFACT.confidenceFloor;
