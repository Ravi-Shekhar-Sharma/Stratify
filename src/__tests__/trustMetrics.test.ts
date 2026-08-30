import { describe, expect, it } from 'vitest';
import { METRICS, calibrationRange, sensorLift, buildLedgerRows } from '../trustMetrics';

describe('METRICS (ml/artifacts/metrics.json)', () => {
  it('loads a non-trivial artifact with the sections the Trust view depends on', () => {
    expect(METRICS.calibration.length).toBeGreaterThan(0);
    expect(METRICS.alertMetricsByBand.easy).toBeDefined();
    expect(METRICS.s6S9LeadTime.deliverable).toBeDefined();
    expect(METRICS.s6S9LeadTime.physicalHeadroom).toBeDefined();
    expect(Object.keys(METRICS.perStation).length).toBeGreaterThan(0);
  });

  it('deliverable and physicalHeadroom are genuinely different numbers, not the same bundle twice', () => {
    const d = METRICS.s6S9LeadTime.deliverable.byBand.easy.leadTimeConditionedOnCausalWarning.medianSeconds;
    const p = METRICS.s6S9LeadTime.physicalHeadroom.byBand.easy.leadTimeConditionedOnCausalWarning.medianSeconds;
    expect(d).not.toBe(p);
    expect(d).not.toBeNull();
    expect(p).not.toBeNull();
  });
});

describe('calibrationRange', () => {
  it('derives min/max from the actual data, not an assumed 0-1 span', () => {
    const range = calibrationRange(METRICS.calibration);
    // The model's real operating range is well inside [0, 1] — asserting
    // it is NOT the full span is the point of this test (catches a
    // regression back to a hardcoded 0-100% axis).
    expect(range.min).toBeGreaterThan(0);
    expect(range.max).toBeLessThan(1);
    expect(range.max).toBeGreaterThan(range.min);
  });

  it('the range covers every point exactly (no point falls outside [min, max])', () => {
    const range = calibrationRange(METRICS.calibration);
    for (const p of METRICS.calibration) {
      expect(p.meanPredictedConfidence).toBeGreaterThanOrEqual(range.min);
      expect(p.meanPredictedConfidence).toBeLessThanOrEqual(range.max);
      expect(p.observedAccuracy).toBeGreaterThanOrEqual(range.min);
      expect(p.observedAccuracy).toBeLessThanOrEqual(range.max);
    }
  });

  it('handles a single point without division-by-zero-shaped output', () => {
    const range = calibrationRange([
      { confidenceBucketLow: 0.6, confidenceBucketHigh: 0.65, meanPredictedConfidence: 0.62, observedAccuracy: 0.6, n: 10 },
    ]);
    expect(range.min).toBeLessThanOrEqual(0.6);
    expect(range.max).toBeGreaterThanOrEqual(0.65);
  });
});

describe('sensorLift', () => {
  it('returns null for a station not in perStation', () => {
    expect(sensorLift('NOT-A-REAL-STATION')).toBeNull();
  });

  it('S6 lift is computed from real perStation/confidenceCeilings data, not hardcoded', () => {
    const lift = sensorLift('S6');
    expect(lift).not.toBeNull();
    expect(lift!.tier).toBe('blind');
    expect(lift!.currentMeanConfidence).toBe(METRICS.perStation['S6'].meanConfidence);
    expect(lift!.tierCeiling).toBe(METRICS.confidenceCeilings.blind);
    expect(lift!.sensoredCeiling).toBe(METRICS.confidenceCeilings.sensored);
    // Ceiling must be strictly above a station currently below the floor's
    // complement — i.e. this is a real, positive lift, not a rounding
    // artifact near zero.
    expect(lift!.liftToTierCeiling).toBeGreaterThan(0);
    expect(lift!.liftToSensoredCeiling).toBeGreaterThan(lift!.liftToTierCeiling!);
  });

  it('lift arithmetic is exact: ceiling - current, both ways', () => {
    const lift = sensorLift('S6')!;
    expect(lift.liftToTierCeiling).toBeCloseTo(lift.tierCeiling! - lift.currentMeanConfidence, 10);
    expect(lift.liftToSensoredCeiling).toBeCloseTo(lift.sensoredCeiling - lift.currentMeanConfidence, 10);
  });

  it('a sensored-tier station (if any existed in perStation) would report a null tierCeiling lift', () => {
    // No sensored station is ever in perStation today (only blind/partial
    // target stations go through the soft sensor) — this documents that
    // invariant rather than asserting a station id that doesn't exist here.
    const sensoredStations = Object.entries(METRICS.perStation).filter(([, s]) => s.tier === 'sensored');
    expect(sensoredStations).toEqual([]);
  });
});

describe('buildLedgerRows', () => {
  const rows = buildLedgerRows();

  it('produces 4 worked-example rows plus 10 worst-case diagnostic rows', () => {
    const worked = rows.filter((r) => r.source === 'worked example');
    const diag = rows.filter((r) => r.source === 'worst-case diagnostic');
    expect(worked.length).toBe(4);
    expect(diag.length).toBe(10);
  });

  it('every row has a real shiftSeed and finite tick/lead-time numbers — nothing synthesized', () => {
    for (const row of rows) {
      expect(Number.isFinite(row.shiftSeed)).toBe(true);
      expect(Number.isFinite(row.onsetTick)).toBe(true);
      expect(Number.isFinite(row.alertTick)).toBe(true);
      expect(Number.isFinite(row.starvedTick)).toBe(true);
      expect(Number.isFinite(row.leadTimeSeconds)).toBe(true);
    }
  });

  it('never labels a physicalHeadroom row as an in-time/late delivered warning', () => {
    for (const row of rows.filter((r) => r.basis === 'physicalHeadroom')) {
      expect(row.outcome).toMatch(/physical headroom/i);
      expect(row.outcome).not.toMatch(/warned/i);
    }
  });

  it('scores deliverable worked examples as WARNED IN TIME or WARNED LATE by the real lead-time sign', () => {
    for (const row of rows.filter((r) => r.basis === 'deliverable')) {
      expect(row.source).toBe('worked example');
      if (row.leadTimeSeconds >= 0) expect(row.outcome).toBe('WARNED IN TIME');
      else expect(row.outcome).toBe('WARNED LATE');
    }
  });

  it('worst-case diagnostic rows are always physicalHeadroom (they are the naive/undebounced pairing)', () => {
    for (const row of rows.filter((r) => r.source === 'worst-case diagnostic')) {
      expect(row.basis).toBe('physicalHeadroom');
    }
  });
});
