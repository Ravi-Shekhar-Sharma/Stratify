import { describe, expect, it } from 'vitest';
import { buildGroundTruthStream } from '../../signals/groundTruth';
import { extractVisits } from '../visits';

describe('extractVisits', () => {
  it("extracts B1's first visit with the correct entry/exit ticks and true cycle time", () => {
    const gt = buildGroundTruthStream({ durationSeconds: 60, seed: 1 });
    const visits = extractVisits(gt);
    const b1 = visits.get('B1')!;
    expect(b1[0]).toMatchObject({
      stationId: 'B1',
      vehicleId: 1,
      entryTick: 0,
      exitTick: 54,
      trueCycleSeconds: 54,
      hadAndon: false,
      hadBlocked: false,
      hadStarved: false,
    });
  });

  it('drops a visit still open when the stream ends (incomplete, no exit tick)', () => {
    const gt = buildGroundTruthStream({ durationSeconds: 60, seed: 1 });
    const visits = extractVisits(gt);
    const b1 = visits.get('B1')!;
    // Vehicle 2 enters B1 at tick 54 and would exit at tick 108, past our
    // 60-tick window — it must not appear as a completed visit.
    expect(b1.every((v) => v.exitTick <= 60)).toBe(true);
    expect(b1.find((v) => v.vehicleId === 2)).toBeUndefined();
  });

  it('records an andon on the visit where S6 crosses the takt window during an incident', () => {
    const gt = buildGroundTruthStream({
      durationSeconds: 1500,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: 80 }],
    });
    const visits = extractVisits(gt);
    const s6 = visits.get('S6')!;
    expect(s6.length).toBeGreaterThan(0);
    const firstVisit = s6[0];
    expect(firstVisit.trueCycleSeconds).toBe(80);
    expect(firstVisit.hadAndon).toBe(true);
    expect(firstVisit.exitTick - firstVisit.entryTick).toBe(80);
  });

  it('captures a process-value reading on a partial station, and none on a blind one', () => {
    // S3 is the line's 23rd station (12 body + 8 paint + 3rd in final
    // assembly), so its first completed visit needs 22 * 54 + 54 = 1,242
    // ticks (arrival, then its own cycle).
    const gt = buildGroundTruthStream({ durationSeconds: 1300, seed: 1 });
    const visits = extractVisits(gt);
    const p7 = visits.get('P7')!; // partial, has a named process value
    const s3 = visits.get('S3')!; // blind, no named process value
    expect(p7.length).toBeGreaterThan(0);
    expect(p7[0].processValue).toBeTypeOf('number');
    expect(s3.length).toBeGreaterThan(0);
    expect(s3[0].processValue).toBeUndefined();
  });

  it('every visit has a non-negative duration and a positive vehicle id', () => {
    const gt = buildGroundTruthStream({ durationSeconds: 3000, seed: 2 });
    const visits = extractVisits(gt);
    for (const [, stationVisits] of visits) {
      for (const v of stationVisits) {
        expect(v.exitTick).toBeGreaterThan(v.entryTick);
        expect(v.vehicleId).toBeGreaterThan(0);
      }
    }
  });
});
