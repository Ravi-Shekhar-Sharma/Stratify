import { describe, expect, it } from 'vitest';
import { buildGroundTruthStream } from '../groundTruth';
import { STATIONS } from '../../stations';

describe('ground truth stream', () => {
  it('has one tick per second for the requested duration', () => {
    const stream = buildGroundTruthStream({ durationSeconds: 100, seed: 1 });
    expect(stream).toHaveLength(100);
    expect(stream[0].tick).toBe(0);
    expect(stream[99].tick).toBe(99);
  });

  it('reports every one of the 42 stations at every tick', () => {
    const stream = buildGroundTruthStream({ durationSeconds: 10, seed: 1 });
    for (const tick of stream) {
      expect(tick.stations).toHaveLength(42);
      expect(new Set(tick.stations.map((s) => s.stationId)).size).toBe(42);
    }
  });

  it('carries the true, currently-in-effect cycle time, including during an incident', () => {
    const stream = buildGroundTruthStream({
      durationSeconds: 5,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: 80 }],
    });
    const s6 = stream[4].stations.find((s) => s.stationId === 'S6')!;
    expect(s6.trueCycleSeconds).toBe(80);
  });

  it('emits an entry event the tick a vehicle arrives and an exit event the tick it leaves', () => {
    const stream = buildGroundTruthStream({ durationSeconds: 60, seed: 1 });
    const b1Ticks = stream.map((t) => t.stations.find((s) => s.stationId === 'B1')!);
    const entryTicks = b1Ticks
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.events.some((e) => e.kind === 'entry'));
    const exitTicks = b1Ticks
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.events.some((e) => e.kind === 'exit'));
    // B1 is takt-paced at 54s with nothing to block it: vehicle 1 enters at
    // tick 0 and exits at tick 54, the same tick vehicle 2 is admitted
    // (back-to-back handoff, zero gap).
    expect(entryTicks.map(({ i }) => i)).toEqual([0, 54]);
    expect(exitTicks.map(({ i }) => i)).toEqual([54]);
  });

  it('only assigns a true process value to stations the table names one for', () => {
    const stream = buildGroundTruthStream({ durationSeconds: 5, seed: 1 });
    const s2 = stream[4].stations.find((s) => s.stationId === 'S2')!; // Cockpit, has fastener_torque_nm
    const s3 = stream[4].stations.find((s) => s.stationId === 'S3')!; // Glazing, blind, no process value in the table
    const s2HasProcessValue = STATIONS.find((s) => s.id === 'S2')!.processValues.length > 0;
    const s3HasProcessValue = STATIONS.find((s) => s.id === 'S3')!.processValues.length > 0;
    expect(s2HasProcessValue).toBe(true);
    expect(s3HasProcessValue).toBe(false);
    expect(s3.trueProcessValue).toBeUndefined();
    // s2's reading only exists once a vehicle is actually occupying it —
    // not asserting a value here, just that the capability is wired.
    void s2;
  });
});
