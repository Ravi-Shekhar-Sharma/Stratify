/**
 * Typed reader for ml/artifacts/metrics.json — the committed, reproducible
 * output of ml/validate.py. Every number the Trust view renders comes
 * through here; nothing in that view is a separate, hand-copied figure.
 * Bundled at build time (same pattern as src/engine/inference/softSensor.ts's
 * soft_sensor.json import) so the page needs no backend and can't drift
 * from whatever the last `python ml/validate.py` run actually produced.
 */
import raw from '../ml/artifacts/metrics.json';

export interface CalibrationPoint {
  confidenceBucketLow: number;
  confidenceBucketHigh: number;
  meanPredictedConfidence: number;
  observedAccuracy: number;
  n: number;
}

export interface AlertBandMetrics {
  n: number;
  nPositive: number;
  precision: number;
  recall: number;
  falseAlarmRate: number;
}

export interface AlertMetricsByBand {
  alertMultiplier: number;
  alertMinHold: number;
  easy: AlertBandMetrics;
  marginal: AlertBandMetrics;
  falseAlarmRateDefinition: string;
}

export interface LeadTimeDistribution {
  n: number;
  medianSeconds: number | null;
  minSeconds: number | null;
  maxSeconds: number | null;
  allSeconds: number[];
}

export interface LeadTimeBandSummary {
  runsWithCausalStarvationAndAlert: number;
  runsAlertFiredNoCausalStarvation: number;
  runsAlertNeverFired: number;
  runsOnlyNonCausalStarvationExcluded: number;
  totalIncidentRuns: number;
  warningFireRate: number | null;
  leadTimeConditionedOnCausalWarning: LeadTimeDistribution;
}

export interface LeadTimeWorkedExample {
  shiftSeed: number;
  incidentAtTick: number;
  alertVehicleId: number;
  alertTick: number;
  alertTickBasis: string;
  alertPredictedCycleSeconds: number;
  alertThresholdSeconds: number;
  allStarvationTicksThisShift: number[];
  pairedStarvationTick: number;
  causalHorizonSeconds: number;
  detectionLagFromOnsetSeconds: number;
  drainTimeFromOnsetSeconds: number;
  leadTimeSeconds: number;
}

export type SeverityBand = 'easy' | 'marginal';

export interface LeadTimeBundle {
  definition: string;
  byBand: Record<SeverityBand, LeadTimeBandSummary>;
  workedExampleByBand: Record<SeverityBand, LeadTimeWorkedExample | null>;
}

export interface S6S9LeadTime {
  backgroundStarvationRate: number | null;
  deliverable: LeadTimeBundle;
  physicalHeadroom: LeadTimeBundle;
}

export interface WorstRunRow {
  shiftSeed: number;
  incidentAtTick: number;
  alertTick: number;
  allStarvationTicksThisShift: number[];
  naivePairedStarvationTick: number;
  naiveLeadTimeSeconds: number;
  naivePairedStarvationWasPreOnset: boolean;
}

export interface TierBreakdown {
  n: number;
  maeSeconds: number;
  meanConfidence: number;
  medianConfidence: number;
}

export type Tier = 'blind' | 'partial' | 'sensored';

export interface StationBreakdown extends TierBreakdown {
  tier: Tier;
}

export interface ConfidenceCeilings {
  blind: number;
  partial: number;
  sensored: number;
}

export interface StationShiftOperation {
  stationId: string;
  shiftSeed: number;
  tier: Tier;
  n: number;
  bottleneckRate: number;
  operatingSeconds: number;
  availability: number;
  performance: number;
  oeeAvailabilityTimesPerformance: number;
}

export interface Metrics {
  validationRows: number;
  trainRows: number;
  validationShiftSeeds: [number, number];
  calibrationToleranceSeconds: number;
  calibrationToleranceDerivation: string;
  alertMetricsByBand: AlertMetricsByBand;
  s6S9LeadTime: S6S9LeadTime;
  worstRunDiagnostic: Record<SeverityBand, WorstRunRow[]>;
  calibration: CalibrationPoint[];
  perTier: Record<'blind' | 'partial', TierBreakdown>;
  perStation: Record<string, StationBreakdown>;
  confidenceCeilings: ConfidenceCeilings;
  stationShiftOperations: StationShiftOperation[];
}

export const METRICS = raw as unknown as Metrics;

/** The real range the calibration curve actually covers — never assumed. */
export function calibrationRange(points: CalibrationPoint[]): { min: number; max: number } {
  const lows = points.map((p) => Math.min(p.confidenceBucketLow, p.meanPredictedConfidence, p.observedAccuracy));
  const highs = points.map((p) => Math.max(p.confidenceBucketHigh, p.meanPredictedConfidence, p.observedAccuracy));
  return { min: Math.min(...lows), max: Math.max(...highs) };
}

export type LeadTimeBasis = 'deliverable' | 'physicalHeadroom';

export interface LedgerRow {
  id: string;
  shiftSeed: number;
  band: SeverityBand;
  basis: LeadTimeBasis;
  source: 'worked example' | 'worst-case diagnostic';
  onsetTick: number;
  alertTick: number;
  starvedTick: number;
  leadTimeSeconds: number;
  outcome: string;
}

/**
 * The trust ledger's rows — every one a real, named shift from metrics.json,
 * never synthesized. Two sources, both explicitly labeled per row (never
 * blended into one undifferentiated "past predictions" list):
 *  - worked examples: one deliverable + one physicalHeadroom case per band
 *    (4 rows) — the representative, positive-outcome cases.
 *  - worst-case diagnostic: the 5 most-negative runs per band under the
 *    physicalHeadroom/naive definition (10 rows) — deliberately the WORST
 *    cases, kept in rather than filtered out.
 * physicalHeadroom rows are never scored "in time / late" — that framing
 * only applies to a definition the product can actually deliver.
 */
export function buildLedgerRows(m: Metrics = METRICS): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const bands: SeverityBand[] = ['easy', 'marginal'];
  const bases: LeadTimeBasis[] = ['deliverable', 'physicalHeadroom'];

  for (const band of bands) {
    for (const basis of bases) {
      const we = m.s6S9LeadTime[basis].workedExampleByBand[band];
      if (!we) continue;
      rows.push({
        id: `we-${basis}-${band}`,
        shiftSeed: we.shiftSeed,
        band,
        basis,
        source: 'worked example',
        onsetTick: we.incidentAtTick,
        alertTick: we.alertTick,
        starvedTick: we.pairedStarvationTick,
        leadTimeSeconds: we.leadTimeSeconds,
        outcome:
          basis === 'deliverable'
            ? we.leadTimeSeconds >= 0
              ? 'WARNED IN TIME'
              : 'WARNED LATE'
            : 'PHYSICAL HEADROOM — reference only',
      });
    }
  }

  for (const band of bands) {
    m.worstRunDiagnostic[band].forEach((r, i) => {
      rows.push({
        id: `diag-${band}-${i}`,
        shiftSeed: r.shiftSeed,
        band,
        basis: 'physicalHeadroom',
        source: 'worst-case diagnostic',
        onsetTick: r.incidentAtTick,
        alertTick: r.alertTick,
        starvedTick: r.naivePairedStarvationTick,
        leadTimeSeconds: r.naiveLeadTimeSeconds,
        outcome: 'PHYSICAL HEADROOM — reference only',
      });
    });
  }

  return rows;
}

export interface SensorLift {
  stationId: string;
  tier: Tier;
  currentMeanConfidence: number;
  n: number;
  tierCeiling: number | null;
  liftToTierCeiling: number | null;
  sensoredCeiling: number;
  liftToSensoredCeiling: number;
}

/**
 * The real instrumentation-lift figure for a given (blind or partial)
 * station: current EMPIRICAL mean calibrated confidence (validate.csv, all
 * visits pooled) vs. the DECLARED ceiling for its tier and for full
 * sensored instrumentation (docs/assumptions.md's "Observability tiers"
 * table). Deliberately not "current -> achieved-after" like the old
 * demo-incident narrative figure (0.86 -> 0.97) — that pair was never
 * measured, on either side. This is a real average compared honestly
 * against a real declared ceiling, not two matched empirical points.
 */
export function sensorLift(stationId: string): SensorLift | null {
  const station = METRICS.perStation[stationId];
  if (!station) return null;
  const tierCeiling = station.tier === 'sensored' ? null : METRICS.confidenceCeilings[station.tier];
  const sensoredCeiling = METRICS.confidenceCeilings.sensored;
  return {
    stationId,
    tier: station.tier,
    currentMeanConfidence: station.meanConfidence,
    n: station.n,
    tierCeiling,
    liftToTierCeiling: tierCeiling !== null ? tierCeiling - station.meanConfidence : null,
    sensoredCeiling,
    liftToSensoredCeiling: sensoredCeiling - station.meanConfidence,
  };
}
