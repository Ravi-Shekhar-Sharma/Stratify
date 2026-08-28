import { describe, expect, it } from 'vitest';
import { buildGroundTruthStream } from '../groundTruth';
import { deriveObservableStream, type BlindObservable } from '../observable';
import { STATIONS } from '../../stations';
import { S6_DEGRADED_CYCLE_SECONDS } from '../../assumptions';

const BLIND_STATION_IDS = STATIONS.filter((s) => s.tier === 'blind').map((s) => s.id);

/**
 * The type checker is the primary proof (see the NoForbiddenKeys constants
 * in observable.ts — they fail `npm run typecheck` if BlindObservable ever
 * gains a cycle-time-shaped field). This function is a second, independent
 * proof colocated with the test: it only type-checks if its argument is
 * EXACTLY a BlindObservable, so if BlindObservable ever grew a
 * `cycleSeconds` field, passing a real blind signal here would still work
 * (structural compatibility), but the explicit exactness check below would
 * not — see the exactness assertion inside the test.
 */
function acceptsOnlyBlindObservable(signal: BlindObservable): void {
  void signal;
}

describe('the blind stations are really blind', () => {
  it('for every blind station, at every tick, the observable signal carries no field derived from true cycle time', () => {
    expect(BLIND_STATION_IDS.length).toBeGreaterThan(0);

    // S6 is both blind and the incident station — the sharpest case, since
    // its true cycle time actively changes (54 -> 80) during this run. If
    // any number derived from that change were reachable on the observable
    // side, this is where it would show up.
    const groundTruth = buildGroundTruthStream({
      durationSeconds: 2000,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: S6_DEGRADED_CYCLE_SECONDS }],
    });
    const observable = deriveObservableStream(groundTruth);

    let blindSignalsChecked = 0;

    for (const tick of observable) {
      for (const signal of tick.stations) {
        if (!BLIND_STATION_IDS.includes(signal.stationId)) continue;
        if (signal.tier !== 'blind') throw new Error(`${signal.stationId} is blind but tagged '${signal.tier}'`);

        acceptsOnlyBlindObservable(signal);
        blindSignalsChecked++;

        // Runtime construction check, independent of the type system: no
        // key on the object itself can hold a cycle-time-derived number.
        expect('cycleSeconds' in signal).toBe(false);
        expect('trueCycleSeconds' in signal).toBe(false);
        expect('processValue' in signal).toBe(false);
        expect(Object.keys(signal).sort()).toEqual(
          ['__observable', 'events', 'stationId', 'tick', 'tier'].sort(),
        );

        // Events are the one legitimate channel blind stations expose —
        // confirm every event on it is an allowed kind, not a smuggled
        // numeric reading dressed up as an event payload.
        for (const event of signal.events) {
          expect(['entry', 'exit', 'andon', 'blocked', 'starved']).toContain(event.kind);
          expect(Object.keys(event).sort()).toEqual(
            Object.keys(event).includes('vehicleId') ? ['kind', 'vehicleId'] : ['kind'],
          );
        }
      }
    }

    // A construction-only proof over zero observations is trivially true
    // and proves nothing — cover it with a floor.
    expect(blindSignalsChecked).toBeGreaterThan(2000 * BLIND_STATION_IDS.length * 0.9);
  });

  it("ground truth itself is not silently filtered — a blind station's true cycle really is 80 during the incident, even though nothing downstream can see it", () => {
    // This is the negative-control check: prove the number genuinely
    // exists in ground truth (so the earlier test isn't vacuously passing
    // because the incident never actually took effect).
    const groundTruth = buildGroundTruthStream({
      durationSeconds: 2000,
      seed: 1,
      incidents: [{ stationId: 'S6', atTick: 0, newCycleSeconds: S6_DEGRADED_CYCLE_SECONDS }],
    });
    const s6AtEnd = groundTruth[1999].stations.find((s) => s.stationId === 'S6')!;
    expect(s6AtEnd.trueCycleSeconds).toBe(S6_DEGRADED_CYCLE_SECONDS);
  });
});
