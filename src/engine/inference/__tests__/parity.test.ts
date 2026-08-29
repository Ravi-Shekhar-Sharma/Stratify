/**
 * Guards the single worst thing this project could show a judge: the demo
 * (TypeScript, src/engine/inference/softSensor.ts) displaying one cycle-time
 * or confidence number while ml/artifacts/metrics.json - computed by Python,
 * ml/validate.py - claims another, because the two independent
 * implementations of the same JSON artifact's math quietly drifted apart.
 *
 * ml/export_parity_fixture.py freezes a fixed set of REAL feature vectors
 * (drawn from validate.csv, one per target station plus a starved-station
 * case and an incident-active case) and Python's own predictions for them
 * into ml/artifacts/parity_fixture.json. This test recomputes the same
 * predictions in TypeScript and asserts both the predicted cycle time and
 * the calibrated confidence - the two numbers the app actually displays -
 * agree with Python to within 1e-6. Neither the fixture nor
 * ml/artifacts/soft_sensor.json is touched here: this test only needs to
 * read committed JSON, no Python or ml/data/*.csv required.
 */
import { describe, expect, it } from 'vitest';
import fixture from '../../../../ml/artifacts/parity_fixture.json';
import { predictSoftSensor, type SoftSensorFeatures } from '../softSensor';

interface ParityCase {
  description: string;
  stationId: string;
  tier: string;
  features: SoftSensorFeatures;
  expected: {
    cycleTimeSeconds: number;
    intervalLowSeconds: number;
    intervalHighSeconds: number;
    rawConfidence: number;
    confidence: number;
  };
}

interface ParityFixture {
  sourceArtifact: string;
  sourceData: string;
  tolerance: number;
  cases: ParityCase[];
}

const FIXTURE = fixture as unknown as ParityFixture;

describe('softSensor / ml/model.py parity', () => {
  it('loaded a non-trivial fixture', () => {
    expect(FIXTURE.cases.length).toBeGreaterThan(0);
    expect(FIXTURE.tolerance).toBeLessThanOrEqual(1e-6);
  });

  for (const testCase of FIXTURE.cases) {
    it(`matches Python within 1e-6: ${testCase.description}`, () => {
      const result = predictSoftSensor(testCase.features);

      // The predicted cycle time - one of the two numbers the app displays.
      expect(result.cycleTimeSeconds).toBeCloseTo(testCase.expected.cycleTimeSeconds, 6);

      // The calibrated confidence - the other number the app displays, and
      // the one this test exists specifically to cover: it depends on the
      // isotonic calibration map, not just the raw tree ensembles.
      expect(result.confidence).toBeCloseTo(testCase.expected.confidence, 6);

      // Also checked, since a divergence here would still be a real bug
      // even though the app doesn't render these two directly.
      expect(result.intervalLowSeconds).toBeCloseTo(testCase.expected.intervalLowSeconds, 6);
      expect(result.intervalHighSeconds).toBeCloseTo(testCase.expected.intervalHighSeconds, 6);
      expect(result.rawConfidence).toBeCloseTo(testCase.expected.rawConfidence, 6);
    });
  }
});
