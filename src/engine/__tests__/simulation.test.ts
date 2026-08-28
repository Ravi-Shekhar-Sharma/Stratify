import { describe, expect, it } from 'vitest';
import { runSimulation } from '../simulation';
import { EFFECTIVE_SECONDS_PER_DAY, S6_DEGRADED_CYCLE_SECONDS } from '../assumptions';
import { STATIONS, TAKT_SECONDS } from '../stations';
import { TRIM_CHASSIS_BUFFER } from '../topology';

describe('undisturbed line', () => {
  it('starts ~1,000 vehicles per day at takt pacing, within tolerance', () => {
    const result = runSimulation({ durationSeconds: EFFECTIVE_SECONDS_PER_DAY, seed: 1 });
    // Every station is balanced at takt, so nothing ever blocks admission —
    // vehiclesStarted is the line's rate: floor(54000 / 54) = 1000 exactly.
    // vehiclesCompleted lags by one pipeline-transit-time (42 stations x 54s
    // = 2,268s) and is reported separately, not asserted on here.
    expect(result.vehiclesStarted).toBeGreaterThanOrEqual(990);
    expect(result.vehiclesStarted).toBeLessThanOrEqual(1010);
  });

  it('emits no andon or starved events when nothing is degraded', () => {
    const result = runSimulation({ durationSeconds: EFFECTIVE_SECONDS_PER_DAY, seed: 1 });
    expect(result.events.filter((e) => e.kind === 'andon')).toHaveLength(0);
    expect(result.events.filter((e) => e.kind === 'starved')).toHaveLength(0);
  });
});

describe('S6 incident — this is the demo', () => {
  it('starves S9 in 415 seconds, plus or minus 30', () => {
    const result = runSimulation({
      durationSeconds: 900,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: S6_DEGRADED_CYCLE_SECONDS }],
    });

    const starvedTick = result.firstStarvedTick['S9'];
    expect(starvedTick).toBeDefined();
    expect(starvedTick as number).toBeGreaterThanOrEqual(415 - 30);
    expect(starvedTick as number).toBeLessThanOrEqual(415 + 30);
  });

  it('drains the trim-to-chassis buffer from its 2.5-unit nominal fill toward zero', () => {
    const result = runSimulation({
      durationSeconds: 200,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: S6_DEGRADED_CYCLE_SECONDS }],
    });
    const level = result.finalBufferLevels[TRIM_CHASSIS_BUFFER.id];
    expect(level).toBeLessThan(TRIM_CHASSIS_BUFFER.nominalFill);
    expect(level).toBeGreaterThan(0);
  });

  it('emits an andon event for S6 the moment it crosses the takt window', () => {
    // S6 is the line's 26th station (12 body + 8 paint + 6th in final
    // assembly), so the first vehicle only reaches it after that many
    // takt-paced handoffs — the andon fires TAKT_SECONDS after that arrival,
    // not at tick 0.
    const s6Index = STATIONS.findIndex((s) => s.id === 'S6');
    const expectedArrival = s6Index * TAKT_SECONDS;
    const result = runSimulation({
      durationSeconds: expectedArrival + TAKT_SECONDS + 10,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: S6_DEGRADED_CYCLE_SECONDS }],
    });
    const s6Andon = result.events.find((e) => e.kind === 'andon' && e.stationId === 'S6');
    expect(s6Andon).toBeDefined();
    expect(s6Andon!.tick).toBe(expectedArrival + TAKT_SECONDS);
  });
});

describe('seeded randomness', () => {
  it('same seed and jitter reproduce identical throughput', () => {
    const a = runSimulation({ durationSeconds: 5000, seed: 42, jitterFraction: 0.02 });
    const b = runSimulation({ durationSeconds: 5000, seed: 42, jitterFraction: 0.02 });
    expect(a.vehiclesStarted).toBe(b.vehiclesStarted);
    expect(a.vehiclesCompleted).toBe(b.vehiclesCompleted);
  });
});
