import { describe, expect, it } from 'vitest';
import { buildGroundTruthStream } from '../signals/groundTruth';
import { deriveObservableStream } from '../signals/observable';
import { extractVisits } from '../ml/visits';
import { VisitTracker } from '../inference/liveVisits';
import { STATIONS } from '../stations';

/**
 * VisitTracker (built from ONLY observable signals, fed one tick at a time)
 * must reconstruct the same visits as extractVisits (built from ground
 * truth, over the whole stream at once) — for every field both can see.
 * If the two ever drift, the live app's features would silently stop
 * matching what the model was trained on.
 */
describe('VisitTracker vs extractVisits (ground truth) — no drift', () => {
  it('agrees on entry/exit ticks and event flags for every completed visit, every station', () => {
    const gt = buildGroundTruthStream({
      durationSeconds: 3000,
      seed: 1,
      jitterFraction: 0.05,
      incidents: [{ stationId: 'S6', atTick: 1700, newCycleSeconds: 80 }],
    });
    const obs = deriveObservableStream(gt);
    const expected = extractVisits(gt);

    const tracker = new VisitTracker();
    for (const tick of obs) tracker.applyTick(tick);

    for (const station of STATIONS) {
      const expectedVisits = expected.get(station.id) ?? [];
      const actualVisits = tracker.completedVisits(station.id);

      expect(actualVisits.length).toBe(expectedVisits.length);
      for (let i = 0; i < expectedVisits.length; i++) {
        expect(actualVisits[i].vehicleId).toBe(expectedVisits[i].vehicleId);
        expect(actualVisits[i].entryTick).toBe(expectedVisits[i].entryTick);
        expect(actualVisits[i].exitTick).toBe(expectedVisits[i].exitTick);
        expect(actualVisits[i].hadAndon).toBe(expectedVisits[i].hadAndon);
        expect(actualVisits[i].hadBlocked).toBe(expectedVisits[i].hadBlocked);
        expect(actualVisits[i].hadStarved).toBe(expectedVisits[i].hadStarved);
      }
    }
  });

  it('exposes true cycle time on sensored visits only, matching ground truth exactly', () => {
    const gt = buildGroundTruthStream({ durationSeconds: 1000, seed: 2, jitterFraction: 0.05 });
    const obs = deriveObservableStream(gt);
    const expected = extractVisits(gt);

    const tracker = new VisitTracker();
    for (const tick of obs) tracker.applyTick(tick);

    const sensoredIds = STATIONS.filter((s) => s.tier === 'sensored').map((s) => s.id);
    for (const id of sensoredIds) {
      const actual = tracker.completedVisits(id);
      const truth = expected.get(id) ?? [];
      for (let i = 0; i < truth.length; i++) {
        expect(actual[i].cycleSeconds).toBe(truth[i].trueCycleSeconds);
      }
    }

    const blindIds = STATIONS.filter((s) => s.tier === 'blind').map((s) => s.id);
    for (const id of blindIds) {
      for (const visit of tracker.completedVisits(id)) {
        expect(visit.cycleSeconds).toBeUndefined();
      }
    }
  });

  it('lastInferableVisit never returns a visit whose downstream counterpart has not completed', () => {
    const gt = buildGroundTruthStream({ durationSeconds: 2000, seed: 3, jitterFraction: 0.05 });
    const obs = deriveObservableStream(gt);
    const tracker = new VisitTracker();

    // Feed ticks one at a time and check the invariant holds at every point
    // in time, not just at the end — this is exactly the live-playback case.
    for (const tick of obs) {
      tracker.applyTick(tick);
      const target = tracker.lastInferableVisit('S6', 'S7');
      if (target) {
        expect(tracker.completedForVehicle('S7', target.vehicleId)).toBeDefined();
      }
    }
  });
});
