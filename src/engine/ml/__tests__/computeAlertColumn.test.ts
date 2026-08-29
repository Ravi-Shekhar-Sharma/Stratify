import { describe, expect, it } from 'vitest';
import { computeAlertColumnsForRows, buildFeatures, type Row } from '../computeAlertColumn';
import { ALERT_MULTIPLIER } from '../../assumptions';
import { TAKT_SECONDS } from '../../stations';

/**
 * A minimal, steady-state (no incident) row for a given station/vehicle —
 * cycle times near takt, no andon/blocked/starved flags. Individual fields
 * can be overridden per test.
 */
function steadyRow(overrides: Partial<Row> & { raw?: Partial<Row['raw']> } = {}): Row {
  const entryTick = overrides.entryTick ?? 0;
  const raw: Row['raw'] = {
    tier: 'blind',
    stationIndexInLine: '25',
    upstreamDwellSeconds: '54',
    upstreamTransitSeconds: '0',
    downstreamDwellSeconds: '54',
    downstreamTransitSeconds: '0',
    targetAndon: '0',
    targetBlocked: '0',
    upstreamAndon: '0',
    upstreamBlocked: '0',
    downstreamAndon: '0',
    downstreamBlocked: '0',
    downstreamStarved: '0',
    bufferLevelAtEntry: '',
    targetProcessValue: '',
    ...overrides.raw,
  };
  return {
    raw,
    shiftSeed: 1,
    stationId: 'S6',
    vehicleId: 1,
    entryTick,
    exitTick: entryTick + TAKT_SECONDS,
    nominalCycleSeconds: TAKT_SECONDS,
    downstreamTransitSeconds: Number(raw.downstreamTransitSeconds),
    downstreamDwellSeconds: Number(raw.downstreamDwellSeconds),
    ...overrides,
  };
}

describe('buildFeatures', () => {
  it('maps isPartialTier from the raw tier column', () => {
    expect(buildFeatures(steadyRow({ raw: { tier: 'partial' } })).isPartialTier).toBe(1);
    expect(buildFeatures(steadyRow({ raw: { tier: 'blind' } })).isPartialTier).toBe(0);
  });

  it('maps empty bufferLevelAtEntry / targetProcessValue to their sentinels, not 0', () => {
    const f = buildFeatures(steadyRow({ raw: { bufferLevelAtEntry: '', targetProcessValue: '' } }));
    expect(f.bufferLevelAtEntry).toBe(-1);
    expect(f.targetProcessValue).toBe(-1);
  });

  it('parses a present targetProcessValue as a real number, not the sentinel', () => {
    const f = buildFeatures(steadyRow({ raw: { targetProcessValue: '0.87' } }));
    expect(f.targetProcessValue).toBeCloseTo(0.87);
  });
});

describe('computeAlertColumnsForRows', () => {
  it('computes availableTick as exitTick + downstreamTransitSeconds + downstreamDwellSeconds', () => {
    const row = steadyRow({ entryTick: 1000, raw: { downstreamTransitSeconds: '5', downstreamDwellSeconds: '60' } });
    const { availableTick } = computeAlertColumnsForRows([row]);
    // exitTick = entryTick + TAKT_SECONDS = 1054
    expect(availableTick[0]).toBe(1054 + 5 + 60);
  });

  it('never activates the alert on steady-state (nominal-cycle) rows', () => {
    const rows = [0, 1, 2, 3].map((i) => steadyRow({ entryTick: i * TAKT_SECONDS, vehicleId: i + 1 }));
    const { alertActive } = computeAlertColumnsForRows(rows);
    expect(alertActive).toEqual([0, 0, 0, 0]);
  });

  it('groups by (shiftSeed, stationId), not by row position — interleaved groups do not cross-contaminate output shape', () => {
    // Two different (shiftSeed, stationId) groups interleaved in input
    // order. The debounce logic itself (dead-band, minHold, reset) is
    // resolveAlertSequence's job and is unit-tested directly in
    // alertSignal.test.ts; this checks THIS module's own responsibility —
    // that grouping by key (not input position) and per-group sorting
    // doesn't throw, drop rows, or misalign output length.
    const groupA = [0, 1, 2].map((i) => steadyRow({ shiftSeed: 1, stationId: 'S6', entryTick: i * 90, vehicleId: i + 1 }));
    const groupB = [0, 1, 2].map((i) => steadyRow({ shiftSeed: 2, stationId: 'S6', entryTick: i * 90, vehicleId: i + 1 }));
    const rows = [groupA[0], groupB[0], groupA[1], groupB[1], groupA[2], groupB[2]];
    const result = computeAlertColumnsForRows(rows);
    expect(result.alertActive.length).toBe(6);
    expect(result.alertActive).toEqual([0, 0, 0, 0, 0, 0]); // all steady-state
  });

  it('preserves input row order in the output arrays regardless of grouping/sort internals', () => {
    const rows = [
      steadyRow({ shiftSeed: 5, stationId: 'S3', entryTick: 200, vehicleId: 3 }),
      steadyRow({ shiftSeed: 5, stationId: 'S3', entryTick: 100, vehicleId: 2 }), // out of entryTick order on purpose
      steadyRow({ shiftSeed: 5, stationId: 'S3', entryTick: 300, vehicleId: 4 }),
    ];
    const result = computeAlertColumnsForRows(rows);
    expect(result.predictedCycleSeconds.length).toBe(3);
    expect(result.availableTick.length).toBe(3);
    expect(result.alertActive.length).toBe(3);
    // Row 1 (entryTick=100) sorts first internally but must still land at
    // output index 1, matching its position in the INPUT array.
    expect(result.availableTick[1]).toBeLessThan(result.availableTick[0]);
  });

  it('the alert threshold used is nominalCycleSeconds * ALERT_MULTIPLIER for the group (sanity on the constant, not a re-derivation)', () => {
    expect(ALERT_MULTIPLIER).toBeGreaterThan(1);
  });
});
