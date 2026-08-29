#!/usr/bin/env python3
"""Train the soft sensor: predict a station's true cycle time from
neighbourhood timing features only, for every station that doesn't get true
cycle time for free. Then calibrate its confidence on a disjoint split.

Scope, stated explicitly (see ml/README.md): this covers the 6 stations
tagged 'blind' (S3, S6, S11, S14, S17, S19) and the 4 tagged 'partial' (P7,
P8, S8, S21) in docs/assumptions.md — neither tier exposes true cycle time,
only sensored does. Partial stations additionally carry one process-value
reading (targetProcessValue), which is a different physical quantity (e.g.
torque), not a substitute for cycle time. One pooled model is trained
across all 10 stations (station identity and tier are features) rather than
10 separate models, so it generalises to a station that loses its sensor
later rather than memorising ten fixed cases.

Excluded by construction: shiftSeed, stationId (raw), vehicleId, entryTick
are simulation bookkeeping, not real deployable signals, and are dropped
before the feature matrix is built (see ml/model.py FEATURES). Nothing
derived from the target station's own trueCycleSeconds is included — every
feature is measured at the immediate upstream/downstream neighbour, or is
the target's own events, which are legitimately observable (blind stations
really do emit andon/blocked events on a real plant; only the numeric cycle
time is hidden). The feature list actually used is printed below so this
claim is auditable, not asserted.

Model: sklearn.ensemble.GradientBoostingRegressor (squared_error loss) for
the point estimate, plus two more at loss='quantile', alpha=0.1/0.9 for a
prediction interval. Source (fetched and checked against the pinned
scikit-learn==1.5.2 before writing this — 'quantile' loss is current, not
deprecated, in this version):
https://scikit-learn.org/1.5/modules/generated/sklearn.ensemble.GradientBoostingRegressor.html

Export: each fitted tree's structure is walked via the documented public
attributes tree_.{feature,threshold,children_left,children_right,value}
(ml/model.py's export_tree). Before writing the artifact, predictions are
reconstructed by walking the exported JSON in pure Python/numpy and checked
against model.predict() on the full training set to at most 1e-6 — if that
check fails, this script raises rather than writing a bad artifact.

Confidence calibration (isotonic regression, fit on the CALIBRATE split,
never on train or validate — see ml/generate.py for why the split must be
disjoint from both):
  1. Compute the raw (uncalibrated) confidence score on the calibrate split
     (ml/model.py's predict_raw_confidence — an interval-width-based proxy,
     only guaranteed to be monotonically ordered, not correctly scaled).
  2. tolerance = one standard deviation of |predicted - true| on the
     calibrate split, computed once and never adjusted afterward. This
     replaces an earlier, indefensible version of this pipeline that picked
     a "correct enough" tolerance specifically because it made the
     calibration curve non-flat — a fixed statistic of the actual error
     distribution instead.
  3. is_correct = |error| <= tolerance, on the calibrate split.
  4. Fit sklearn.isotonic.IsotonicRegression(raw_confidence -> is_correct)
     on the calibrate split. This directly maps raw confidence to observed
     accuracy rate, which is what "confidence" is supposed to mean, rather
     than a hand-picked linear rescale.
  5. Export (X_thresholds_, y_thresholds_) into the artifact. Self-checked
     the same way as the trees: reconstruct via ml/model.py's apply_isotonic
     and compare to IsotonicRegression.predict() before writing.

Training data noise: the underlying simulation is deterministic (0 jitter)
by default. ml/generate.py explicitly requests +-5% cycle-time jitter for
ML data specifically — an assumed input, not measured, not sourced from
docs/assumptions.md (that file gives no variance figure), chosen once
before any model was trained and never adjusted based on results.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.isotonic import IsotonicRegression

import model as sensor

REPO_ROOT = Path(__file__).resolve().parent.parent
TRAIN_CSV = REPO_ROOT / "ml" / "data" / "train.csv"
CALIBRATE_CSV = REPO_ROOT / "ml" / "data" / "calibrate.csv"
ARTIFACT_PATH = REPO_ROOT / "ml" / "artifacts" / "soft_sensor.json"


def fit_and_export(X, y: np.ndarray, loss: str, alpha: float | None) -> dict:
    kwargs = dict(
        loss=loss,
        n_estimators=200,
        max_depth=3,
        learning_rate=0.1,
        random_state=1,
    )
    if alpha is not None:
        kwargs["alpha"] = alpha
    fitted = GradientBoostingRegressor(**kwargs)
    fitted.fit(X, y)

    X_np = X.to_numpy()
    init_value = float(fitted.init_.predict(X_np[:1])[0])
    exported = {
        "learningRate": fitted.learning_rate,
        "initValue": init_value,
        "trees": [sensor.export_tree(est[0].tree_) for est in fitted.estimators_],
    }

    reconstructed = sensor.predict_ensemble_from_json(exported, X_np)
    real = fitted.predict(X_np)
    max_diff = float(np.max(np.abs(reconstructed - real)))
    if max_diff > 1e-6:
        raise RuntimeError(
            f"JSON export parity check FAILED for loss={loss}: max diff "
            f"{max_diff} exceeds 1e-6. Refusing to write the artifact."
        )
    print(f"  [{loss}{f' alpha={alpha}' if alpha else ''}] "
          f"export parity check passed, max diff {max_diff:.2e}")

    return exported


def main() -> None:
    if not TRAIN_CSV.exists():
        raise SystemExit(f"{TRAIN_CSV} does not exist - run ml/generate.py first.")
    if not CALIBRATE_CSV.exists():
        raise SystemExit(f"{CALIBRATE_CSV} does not exist - run ml/generate.py first.")

    X, y, meta = sensor.load_features(TRAIN_CSV)

    print(f"Training rows: {len(X)}")
    print(f"By tier: {meta['tier'].value_counts().to_dict()}")
    print(f"By station: {meta['stationId'].value_counts().sort_index().to_dict()}")
    print("Feature list (audit this - nothing here may be derived from the "
          "target station's own true cycle time):")
    for f in sensor.FEATURES:
        print(f"  - {f}")
    print()

    print("Fitting point estimate (squared_error)...")
    point_json = fit_and_export(X, y, "squared_error", None)

    print("Fitting q10 (loss='quantile', alpha=0.1)...")
    q10_json = fit_and_export(X, y, "quantile", 0.1)

    print("Fitting q90 (loss='quantile', alpha=0.9)...")
    q90_json = fit_and_export(X, y, "quantile", 0.9)

    X_np = X.to_numpy()
    q10_pred = sensor.predict_ensemble_from_json(q10_json, X_np)
    q90_pred = sensor.predict_ensemble_from_json(q90_json, X_np)
    interval_widths = np.clip(q90_pred - q10_pred, 0, None)
    ref_low = float(np.percentile(interval_widths, 5))
    ref_high = float(np.percentile(interval_widths, 95))
    print(f"\nRaw-confidence reference range (p5, p95 of training interval "
          f"widths): [{ref_low:.2f}s, {ref_high:.2f}s]")

    target_stations = sorted(pd.read_csv(TRAIN_CSV)["stationId"].unique().tolist())

    artifact = {
        "featureNames": sensor.FEATURES,
        "missingBufferSentinel": sensor.MISSING_BUFFER_SENTINEL,
        "missingProcessValueSentinel": sensor.MISSING_PROCESS_VALUE_SENTINEL,
        "targetStations": target_stations,
        "confidenceCeiling": sensor.CONFIDENCE_CEILING,
        "confidenceFloor": sensor.CONFIDENCE_FLOOR,
        "confidenceReferenceWidthLowSeconds": ref_low,
        "confidenceReferenceWidthHighSeconds": ref_high,
        "pointEstimate": point_json,
        "quantileLow": {"alpha": 0.1, **q10_json},
        "quantileHigh": {"alpha": 0.9, **q90_json},
    }

    # --- Confidence calibration, fit on the CALIBRATE split ---------------
    print(f"\nLoading calibration split: {CALIBRATE_CSV}")
    Xc, yc, _metac = sensor.load_features(CALIBRATE_CSV)
    Xc_np = Xc.to_numpy()
    print(f"Calibration rows: {len(Xc)}")

    yc_pred = sensor.predict_ensemble_from_json(point_json, Xc_np)
    qc_low = sensor.predict_ensemble_from_json(q10_json, Xc_np)
    qc_high = sensor.predict_ensemble_from_json(q90_json, Xc_np)
    raw_confidence = sensor.predict_raw_confidence(artifact, qc_low, qc_high)

    residuals = yc_pred - yc
    tolerance = float(np.std(residuals))
    print(f"Calibration tolerance (1 std of residuals on the calibration "
          f"split, computed once): {tolerance:.3f}s")
    is_correct = (np.abs(residuals) <= tolerance).astype(float)
    print(f"Calibration split base rate (fraction 'correct' at this "
          f"tolerance): {is_correct.mean():.3f}")

    iso = IsotonicRegression(increasing=True, out_of_bounds="clip")
    iso.fit(raw_confidence, is_correct)

    calibration_map = {
        "xThresholds": iso.X_thresholds_.tolist(),
        "yThresholds": iso.y_thresholds_.tolist(),
        "toleranceSeconds": tolerance,
        "toleranceDerivation": "1 standard deviation of residuals on the calibration split",
        "fitRows": int(len(Xc)),
    }

    reconstructed_calibrated = sensor.apply_isotonic(calibration_map, raw_confidence)
    real_calibrated = iso.predict(raw_confidence)
    max_diff = float(np.max(np.abs(reconstructed_calibrated - real_calibrated)))
    if max_diff > 1e-6:
        raise RuntimeError(
            f"Isotonic calibration export parity check FAILED: max diff "
            f"{max_diff} exceeds 1e-6. Refusing to write the artifact."
        )
    print(f"  [isotonic calibration] export parity check passed, max diff {max_diff:.2e}")

    artifact["confidenceCalibration"] = calibration_map

    ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ARTIFACT_PATH.write_text(json.dumps(artifact, indent=2))
    n_trees = sum(len(t["trees"]) for t in [point_json, q10_json, q90_json])
    print(f"\nWrote {ARTIFACT_PATH} ({n_trees} trees total, "
          f"{len(calibration_map['xThresholds'])} calibration thresholds)")


if __name__ == "__main__":
    main()
