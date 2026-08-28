import { describe, expect, it } from 'vitest';
import { buildGroundTruthStream } from '../groundTruth';
import { deriveObservableStream } from '../observable';
import { STATIONS } from '../../stations';

const BLIND_IDS = STATIONS.filter((s) => s.tier === 'blind').map((s) => s.id);
const PARTIAL_IDS = STATIONS.filter((s) => s.tier === 'partial').map((s) => s.id);
const SENSORED_IDS = STATIONS.filter((s) => s.tier === 'sensored').map((s) => s.id);

describe('observable stream — the separation', () => {
  it('gives blind stations only tier, events, stationId, tick — nothing else, ever', () => {
    const gt = buildGroundTruthStream({
      durationSeconds: 2000,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: 80 }],
    });
    const obs = deriveObservableStream(gt);

    for (const tick of obs) {
      for (const signal of tick.stations) {
        if (BLIND_IDS.includes(signal.stationId)) {
          expect(signal.tier).toBe('blind');
          expect(Object.keys(signal).sort()).toEqual(
            ['__observable', 'events', 'stationId', 'tick', 'tier'].sort(),
          );
          expect('cycleSeconds' in signal).toBe(false);
          expect('processValue' in signal).toBe(false);
        }
      }
    }
  });

  it('gives partial stations exactly one process value field and no cycle time', () => {
    const gt = buildGroundTruthStream({ durationSeconds: 200, seed: 1 });
    const obs = deriveObservableStream(gt);
    for (const tick of obs) {
      for (const signal of tick.stations) {
        if (PARTIAL_IDS.includes(signal.stationId)) {
          expect(signal.tier).toBe('partial');
          expect('cycleSeconds' in signal).toBe(false);
          expect(Object.keys(signal).sort()).toEqual(
            ['__observable', 'events', 'processValue', 'stationId', 'tick', 'tier'].sort(),
          );
        }
      }
    }
  });

  it('gives sensored stations the true cycle time and a process value', () => {
    const gt = buildGroundTruthStream({ durationSeconds: 200, seed: 1 });
    const obs = deriveObservableStream(gt);
    for (const tick of obs) {
      for (const signal of tick.stations) {
        if (SENSORED_IDS.includes(signal.stationId)) {
          expect(signal.tier).toBe('sensored');
          expect(typeof (signal as { cycleSeconds: number }).cycleSeconds).toBe('number');
        }
      }
    }
  });

  it('sensored cycleSeconds tracks true cycle time exactly — verifying the pass-through, not just its absence elsewhere', () => {
    const gt = buildGroundTruthStream({ durationSeconds: 5, seed: 1 });
    const obs = deriveObservableStream(gt);
    const gtS1 = gt[4].stations.find((s) => s.stationId === 'S1')!;
    const obsS1 = obs[4].stations.find((s) => s.stationId === 'S1')! as { cycleSeconds: number };
    expect(obsS1.cycleSeconds).toBe(gtS1.trueCycleSeconds);
  });

  it("a blind station's observable shape is identical whether or not its true cycle degrades", () => {
    // S6 is blind AND the incident station — the sharpest possible check:
    // does the true cycle time (54 -> 80) leak into the blind signal shape?
    const steady = deriveObservableStream(buildGroundTruthStream({ durationSeconds: 500, seed: 1 }));
    const incident = deriveObservableStream(
      buildGroundTruthStream({
        durationSeconds: 500,
        seed: 1,
        incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: 80 }],
      }),
    );
    for (let i = 0; i < steady.length; i++) {
      const a = steady[i].stations.find((s) => s.stationId === 'S6')!;
      const b = incident[i].stations.find((s) => s.stationId === 'S6')!;
      expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    }
  });
});
