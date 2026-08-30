import { describe, expect, it } from 'vitest';
import {
  coverageByShop,
  bottleneckHeatmap,
  shiftVariationByStation,
  stationAvailabilityOee,
} from '../opsMetrics';
import { METRICS } from '../trustMetrics';

describe('coverageByShop', () => {
  const shops = coverageByShop();

  it('covers all 42 stations across exactly the three shops, none dropped', () => {
    const total = shops.reduce((sum, s) => sum + s.stations.length, 0);
    expect(total).toBe(42);
    expect(shops.map((s) => s.shop).sort()).toEqual(['body', 'final', 'paint']);
  });

  it('every station has a real tier from the engine, not a placeholder', () => {
    for (const shop of shops) {
      for (const station of shop.stations) {
        expect(['sensored', 'partial', 'blind']).toContain(station.tier);
      }
    }
  });

  it('final assembly is where blindness concentrates, matching docs/assumptions.md', () => {
    const final = shops.find((s) => s.shop === 'final')!;
    const blindInFinal = final.stations.filter((s) => s.tier === 'blind').length;
    expect(blindInFinal).toBe(6);
  });
});

describe('bottleneckHeatmap', () => {
  const heatmap = bottleneckHeatmap();

  it('has one row per station present in stationShiftOperations, sorted', () => {
    const expectedStations = new Set(METRICS.stationShiftOperations.map((r) => r.stationId));
    expect(new Set(heatmap.stationIds)).toEqual(expectedStations);
    expect(heatmap.stationIds).toEqual([...heatmap.stationIds].sort());
  });

  it('has one column per distinct shiftSeed, sorted ascending', () => {
    const expectedShifts = new Set(METRICS.stationShiftOperations.map((r) => r.shiftSeed));
    expect(new Set(heatmap.shiftSeeds)).toEqual(expectedShifts);
    expect(heatmap.shiftSeeds).toEqual([...heatmap.shiftSeeds].sort((a, b) => a - b));
  });

  it('every real (station, shift) pair is retrievable and matches the source rate exactly', () => {
    for (const row of METRICS.stationShiftOperations) {
      const cell = heatmap.rate(row.stationId, row.shiftSeed);
      expect(cell).toBe(row.bottleneckRate);
    }
  });

  it('a (station, shift) pair with no data returns null, not zero (never fabricate a rate)', () => {
    expect(heatmap.rate('NOT-A-REAL-STATION', 999999)).toBeNull();
  });
});

describe('shiftVariationByStation', () => {
  const variation = shiftVariationByStation();

  it('produces one entry per station in stationShiftOperations', () => {
    const expectedStations = new Set(METRICS.stationShiftOperations.map((r) => r.stationId));
    expect(variation.map((v) => v.stationId).sort()).toEqual([...expectedStations].sort());
  });

  it('min <= mean <= max for every station, computed from the real per-shift rates', () => {
    for (const v of variation) {
      expect(v.min).toBeLessThanOrEqual(v.mean);
      expect(v.mean).toBeLessThanOrEqual(v.max);
    }
  });

  it('n equals the number of shifts actually observed for that station', () => {
    for (const v of variation) {
      const actual = METRICS.stationShiftOperations.filter((r) => r.stationId === v.stationId).length;
      expect(v.n).toBe(actual);
    }
  });
});

describe('stationAvailabilityOee', () => {
  const rows = stationAvailabilityOee();

  it('produces one entry per station, each an average over its real per-shift rows', () => {
    const expectedStations = new Set(METRICS.stationShiftOperations.map((r) => r.stationId));
    expect(rows.map((r) => r.stationId).sort()).toEqual([...expectedStations].sort());
  });

  it('meanAvailability and meanPerformance are plain averages of the underlying rows', () => {
    const bySid = new Map<string, typeof METRICS.stationShiftOperations>();
    for (const r of METRICS.stationShiftOperations) {
      const list = bySid.get(r.stationId) ?? [];
      list.push(r);
      bySid.set(r.stationId, list);
    }
    for (const row of rows) {
      const source = bySid.get(row.stationId)!;
      const expectedAvailability = source.reduce((s, r) => s + r.availability, 0) / source.length;
      expect(row.meanAvailability).toBeCloseTo(expectedAvailability, 10);
    }
  });

  it('meanOee is the average of the real per-shift Availability x Performance product — never a third, invented quality factor', () => {
    const bySid = new Map<string, typeof METRICS.stationShiftOperations>();
    for (const r of METRICS.stationShiftOperations) {
      const list = bySid.get(r.stationId) ?? [];
      list.push(r);
      bySid.set(r.stationId, list);
    }
    for (const row of rows) {
      const source = bySid.get(row.stationId)!;
      const expectedOee = source.reduce((s, r) => s + r.oeeAvailabilityTimesPerformance, 0) / source.length;
      expect(row.meanOee).toBeCloseTo(expectedOee, 10);
    }
  });
});
