#!/usr/bin/env python3
"""Export a small, fixed set of real feature vectors from validate.csv,
together with the Python model's predictions for each, to
ml/artifacts/parity_fixture.json.

This is the reference the TypeScript port (src/engine/inference/softSensor.ts)
is checked against in src/engine/inference/__tests__/parity.test.ts. The
fixture is committed (unlike ml/data/*.csv) so the parity test needs neither
Python nor the gitignored validate.csv at test time - only the artifact and
this fixture, both under ml/artifacts/.

Selection is deterministic and drawn from real rows (not synthesized), to
exercise the actual value ranges and tier/incident/starvation combinations
the model sees in practice: one row per target station (first occurrence in
file order), plus the first row with downstreamStarved=1 and the first row
with trueIncidentActive=1, if not already covered.

Run this again only if soft_sensor.json is retrained or the feature schema
changes - not part of the normal generate/train/validate loop.
"""
import json
from pathlib import Path

import pandas as pd

import model as sensor

REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATE_CSV = REPO_ROOT / "ml" / "data" / "validate.csv"
ARTIFACT_PATH = REPO_ROOT / "ml" / "artifacts" / "soft_sensor.json"
FIXTURE_PATH = REPO_ROOT / "ml" / "artifacts" / "parity_fixture.json"


def row_to_case(X: pd.DataFrame, meta: pd.DataFrame, artifact: dict, idx: int, description: str) -> dict:
    row = X.iloc[[idx]].to_numpy()

    point = float(sensor.predict_point(artifact, row)[0])
    low, high = sensor.predict_interval(artifact, row)
    low, high = float(low[0]), float(high[0])
    raw_conf = float(sensor.predict_raw_confidence(artifact, low, high))
    calibrated_conf = float(sensor.predict_calibrated_confidence(artifact, low, high))

    features = {name: float(X.iloc[idx][name]) for name in sensor.FEATURES}

    return {
        "description": description,
        "stationId": str(meta.iloc[idx]["stationId"]),
        "tier": str(meta.iloc[idx]["tier"]),
        "features": features,
        "expected": {
            "cycleTimeSeconds": point,
            "intervalLowSeconds": low,
            "intervalHighSeconds": high,
            "rawConfidence": raw_conf,
            "confidence": calibrated_conf,
        },
    }


def main() -> None:
    if not VALIDATE_CSV.exists():
        raise SystemExit(f"{VALIDATE_CSV} does not exist - run ml/generate.py first.")
    if not ARTIFACT_PATH.exists():
        raise SystemExit(f"{ARTIFACT_PATH} does not exist - run ml/train.py first.")

    artifact = json.loads(ARTIFACT_PATH.read_text())
    df = pd.read_csv(VALIDATE_CSV, dtype={"s9StarvationTicksAll": str})
    X, y, meta = sensor.load_features(VALIDATE_CSV)

    cases = []
    seen_stations = set()

    for station in sorted(df["stationId"].unique()):
        idx = df.index[df["stationId"] == station][0]
        cases.append(row_to_case(X, meta, artifact, idx, f"first {station} row in validate.csv"))
        seen_stations.add(station)

    starved_idx = df.index[df["downstreamStarved"] == 1]
    if len(starved_idx) > 0:
        idx = starved_idx[0]
        cases.append(row_to_case(X, meta, artifact, idx, "first downstreamStarved=1 row in validate.csv"))

    incident_idx = df.index[df["trueIncidentActive"] == 1]
    if len(incident_idx) > 0:
        idx = incident_idx[0]
        cases.append(row_to_case(X, meta, artifact, idx, "first trueIncidentActive=1 row in validate.csv"))

    FIXTURE_PATH.write_text(json.dumps({
        "sourceArtifact": "ml/artifacts/soft_sensor.json",
        "sourceData": "ml/data/validate.csv (seeds 100000..100014)",
        "tolerance": 1e-6,
        "cases": cases,
    }, indent=2))
    print(f"Wrote {FIXTURE_PATH} ({len(cases)} cases, stations covered: {sorted(seen_stations)})")


if __name__ == "__main__":
    main()
