import { describe, expect, it } from 'vitest';
import { rankedSensorInvestments, budgetTiers, rolloutPath, PAYBACK_STATUS } from '../investmentMetrics';
import { METRICS } from '../trustMetrics';
import { MAINTENANCE_WINDOWS_PER_YEAR } from '../engine/assumptions';

describe('rankedSensorInvestments', () => {
  const ranked = rankedSensorInvestments();

  it('covers every non-sensored station in perStation, none dropped or invented', () => {
    const expected = Object.entries(METRICS.perStation)
      .filter(([, s]) => s.tier !== 'sensored')
      .map(([sid]) => sid);
    expect(ranked.map((r) => r.stationId).sort()).toEqual(expected.sort());
  });

  it('confidenceGain is exactly the sensored ceiling minus the real empirical mean confidence', () => {
    for (const r of ranked) {
      const station = METRICS.perStation[r.stationId];
      expect(r.confidenceGain).toBeCloseTo(METRICS.confidenceCeilings.sensored - station.meanConfidence, 10);
    }
  });

  it('is sorted descending by gain per dollar, ranks assigned 1..n with no gaps', () => {
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].gainPerThousandUsd).toBeGreaterThanOrEqual(ranked[i].gainPerThousandUsd);
    }
    expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
  });

  it('cost range comes from the same docs/assumptions.md figure for every station (no fabricated per-station cost)', () => {
    const lows = new Set(ranked.map((r) => r.costLowUsd));
    const highs = new Set(ranked.map((r) => r.costHighUsd));
    expect(lows.size).toBe(1);
    expect(highs.size).toBe(1);
  });
});

describe('budgetTiers', () => {
  const tiers = budgetTiers();
  const ranked = rankedSensorInvestments();

  it('produces exactly three fixed levels', () => {
    expect(tiers.length).toBe(3);
  });

  it('each tier covers the top-N stations by rank, N strictly increasing, the last covering all stations', () => {
    expect(tiers[0].stationCount).toBeLessThan(tiers[1].stationCount);
    expect(tiers[1].stationCount).toBeLessThan(tiers[2].stationCount);
    expect(tiers[2].stationCount).toBe(ranked.length);
  });

  it('a tier\'s station list is exactly the top-N ranked station ids, in rank order', () => {
    for (const tier of tiers) {
      const expected = ranked.slice(0, tier.stationCount).map((r) => r.stationId);
      expect(tier.stationIds).toEqual(expected);
    }
  });

  it('total cost is the real sum of each covered station\'s cost bounds, not a round invented number', () => {
    for (const tier of tiers) {
      const covered = ranked.slice(0, tier.stationCount);
      const expectedLow = covered.reduce((s, r) => s + r.costLowUsd, 0);
      const expectedHigh = covered.reduce((s, r) => s + r.costHighUsd, 0);
      expect(tier.totalCostLowUsd).toBe(expectedLow);
      expect(tier.totalCostHighUsd).toBe(expectedHigh);
    }
  });
});

describe('rolloutPath', () => {
  const ranked = rankedSensorInvestments();
  const allIds = ranked.map((r) => r.stationId);
  const steps = rolloutPath(allIds);

  it('schedules every requested station exactly once', () => {
    expect(steps.map((s) => s.stationId).sort()).toEqual([...allIds].sort());
  });

  it('assigns stations in rank order, filling windows within a year before advancing to the next year', () => {
    for (let i = 0; i < steps.length; i++) {
      const expectedYear = Math.floor(i / MAINTENANCE_WINDOWS_PER_YEAR) + 1;
      const expectedWindow = (i % MAINTENANCE_WINDOWS_PER_YEAR) + 1;
      expect(steps[i].year).toBe(expectedYear);
      expect(steps[i].windowInYear).toBe(expectedWindow);
    }
  });

  it('never schedules more than MAINTENANCE_WINDOWS_PER_YEAR stations into the same (year, window)', () => {
    const seen = new Set<string>();
    for (const s of steps) {
      const key = `${s.year} ${s.windowInYear}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('PAYBACK_STATUS', () => {
  it('is explicitly unavailable, not a fabricated number, and says why', () => {
    expect(PAYBACK_STATUS.available).toBe(false);
    expect(PAYBACK_STATUS.reason.length).toBeGreaterThan(0);
  });
});
