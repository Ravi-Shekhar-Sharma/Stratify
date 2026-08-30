"""Shared soft-sensor model code: feature loading, the pure-Python tree-walk
predictor, and the confidence formula. Used by both train.py (to self-check
its own JSON export before writing the artifact) and validate.py (to score
the held-out set) — one implementation, so the two scripts cannot drift
against each other the way a from-scratch reimplementation could.
"""
import json
import subprocess
import sys
from pathlib import Path
from functools import lru_cache

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
PRINT_ML_CONSTANTS = REPO_ROOT / "src" / "engine" / "ml" / "printMlConstants.ts"
COMPUTE_ALERT_COLUMN = REPO_ROOT / "src" / "engine" / "ml" / "computeAlertColumn.ts"


@lru_cache(maxsize=1)
def ml_constants() -> dict:
    """Single source of truth for jitter/alert-multiplier/severity-band
    numbers: src/engine/assumptions.ts (which mirrors docs/assumptions.md's
    "## ML modelling choices" section). This reads them from there via the
    TS CLI rather than hardcoding a second copy in Python — see
    docs/assumptions.md for why each number has the value it does."""
    result = subprocess.run(
        ["npx", "tsx", str(PRINT_ML_CONSTANTS)],
        cwd=REPO_ROOT, capture_output=True, text=True, shell=(sys.platform == "win32"),
    )
    if result.returncode != 0:
        raise RuntimeError(f"printMlConstants.ts failed: {result.stderr}")
    return json.loads(result.stdout)


def compute_alert_column(csv_path: Path, out_path: Path) -> pd.DataFrame:
    """Runs src/engine/ml/computeAlertColumn.ts against csv_path and returns
    its output. This is the ONLY place "is this row alerting" is computed
    for the offline evidence pipeline — never re-derived in Python — so it
    is structurally unable to drift from what the live UI's classifyStation
    (src/engine/inference/stationDisplay.ts) does: both call
    resolveAlertSequence from the same TypeScript module
    (src/engine/inference/alertSignal.ts), walking the same trained
    artifact via predictSoftSensor. Output columns: shiftSeed, stationId,
    vehicleId, entryTick (join keys back onto csv_path's own rows),
    predictedCycleSeconds, availableTick (see that file's docstring for why
    this differs from entryTick), and alertActive (0/1, debounced per
    ALERT_MIN_HOLD)."""
    result = subprocess.run(
        ["npx", "tsx", str(COMPUTE_ALERT_COLUMN), "--csv", str(csv_path), "--out", str(out_path)],
        cwd=REPO_ROOT, capture_output=True, text=True, shell=(sys.platform == "win32"),
    )
    if result.returncode != 0:
        raise RuntimeError(f"computeAlertColumn.ts failed: {result.stderr}")
    return pd.read_csv(out_path)


def merge_alert_column(meta: pd.DataFrame, alert_df: pd.DataFrame) -> pd.DataFrame:
    """Joins the unified alert column (see compute_alert_column) onto meta
    by (shiftSeed, stationId, vehicleId) — unique together, since a given
    vehicle visits a given station at most once. Fails loudly on any
    unmatched row rather than silently dropping or NaN-filling one."""
    merged = meta.merge(
        alert_df[["shiftSeed", "stationId", "vehicleId", "predictedCycleSeconds", "availableTick", "alertActive"]],
        on=["shiftSeed", "stationId", "vehicleId"],
        how="left",
        validate="one_to_one",
    )
    if merged["alertActive"].isna().any():
        raise RuntimeError(
            f"{int(merged['alertActive'].isna().sum())} rows failed to match the unified alert column - "
            "the CSV passed to compute_alert_column must be the exact same file this meta came from."
        )
    merged["alertActive"] = merged["alertActive"].astype(bool)
    return merged

FEATURES = [
    "stationIndexInLine",
    "isPartialTier",
    "upstreamDwellSeconds",
    "upstreamTransitSeconds",
    "downstreamDwellSeconds",
    "downstreamTransitSeconds",
    "targetAndon",
    "targetBlocked",
    "upstreamAndon",
    "upstreamBlocked",
    "downstreamAndon",
    "downstreamBlocked",
    "downstreamStarved",
    "bufferLevelAtEntry",
    "targetProcessValue",
]
LABEL = "trueCycleSeconds"
MISSING_BUFFER_SENTINEL = -1.0
# Blind stations have no process-value reading at all (not missing data —
# structurally absent by tier definition). isPartialTier tells the model
# which case it's in, so this sentinel isn't confused with a real low
# reading (values cluster near 1.0, see ml/train.py's docstring on
# groundTruth.ts's placeholder process-value generator).
MISSING_PROCESS_VALUE_SENTINEL = -1.0

# From docs/assumptions.md, "## Observability tiers": Partial and Blind
# share the same 0.90 max-confidence ceiling — the file does not grant
# partial stations a higher ceiling for their extra process-value signal.
# Any confidence advantage partial stations show up with in validate.py's
# per-tier breakdown has to come from an empirically tighter prediction
# interval, not from a different ceiling assigned here.
CONFIDENCE_CEILING = 0.90
CONFIDENCE_FLOOR = 0.60


def load_features(csv_path: Path) -> tuple[pd.DataFrame, np.ndarray, pd.DataFrame]:
    """Returns (X, y, meta) — meta keeps everything needed for grouping and
    regime/band analysis (shiftSeed, stationId, tier, vehicleId, entryTick,
    nominalCycleSeconds, trueIncidentActive, s9StarvedTick); none of it goes
    into the feature matrix."""
    df = pd.read_csv(csv_path, dtype={"s9StarvationTicksAll": str})
    df["bufferLevelAtEntry"] = pd.to_numeric(
        df["bufferLevelAtEntry"], errors="coerce"
    ).fillna(MISSING_BUFFER_SENTINEL)
    df["targetProcessValue"] = pd.to_numeric(
        df["targetProcessValue"], errors="coerce"
    ).fillna(MISSING_PROCESS_VALUE_SENTINEL)
    df["isPartialTier"] = (df["tier"] == "partial").astype(float)
    X = df[FEATURES].astype(float)
    y = df[LABEL].astype(float).to_numpy()
    meta = df[[
        "shiftSeed", "stationId", "tier", "vehicleId", "entryTick", "exitTick",
        "nominalCycleSeconds", "trueIncidentActive", "severityBand",
    ]].copy()
    meta["s9StarvedTick"] = pd.to_numeric(df["s9StarvedTick"], errors="coerce")
    meta["visitIndexSinceIncident"] = pd.to_numeric(df["visitIndexSinceIncident"], errors="coerce")
    meta["s9StarvationTicksAll"] = df["s9StarvationTicksAll"]
    meta["incidentAtTick"] = pd.to_numeric(df["incidentAtTick"], errors="coerce")
    return X, y, meta


def parse_starvation_ticks(cell) -> list[float]:
    """Parse a s9StarvationTicksAll CSV cell ('123;456' or '' or NaN) into a
    list of tick floats, in shift-chronological order."""
    if pd.isna(cell) or cell == "":
        return []
    return [float(t) for t in str(cell).split(";") if t != ""]


def export_tree(tree) -> dict:
    """Walk a fitted sklearn Tree's public arrays into plain JSON.
    Source: https://scikit-learn.org/1.5/modules/generated/sklearn.tree.DecisionTreeRegressor.html
    ("tree_ ... The underlying Tree object")."""
    return {
        "feature": tree.feature.tolist(),
        "threshold": tree.threshold.tolist(),
        "childrenLeft": tree.children_left.tolist(),
        "childrenRight": tree.children_right.tolist(),
        "value": tree.value.reshape(tree.node_count).tolist(),
    }


def _tree_predict_vectorized(tree: dict, X: np.ndarray) -> np.ndarray:
    """Same tree walk as a naive per-row Python loop, but vectorized across
    all rows at once: every row's "current node" is tracked in one array,
    and each iteration advances every row that hasn't reached a leaf yet by
    one level. Trees here are shallow (max_depth=3, so at most 4 levels),
    so this is a handful of numpy-wide steps rather than a Python-level loop
    over rows x trees x depth — the naive version was the actual bottleneck
    in reproducing this pipeline from a clean checkout."""
    feature = np.asarray(tree["feature"])
    threshold = np.asarray(tree["threshold"])
    left = np.asarray(tree["childrenLeft"])
    right = np.asarray(tree["childrenRight"])
    value = np.asarray(tree["value"])

    node = np.zeros(X.shape[0], dtype=np.int64)
    active = left[node] != -1
    # node_count bounds the number of levels a balanced-ish tree can have;
    # this is just a safety cap against a pathological/malformed tree, not
    # a performance-relevant bound (see the loop's own termination check).
    for _ in range(len(feature)):
        if not np.any(active):
            break
        feat_idx = feature[node[active]]
        thresh = threshold[node[active]]
        go_left = X[active, feat_idx] <= thresh
        next_node = np.where(go_left, left[node[active]], right[node[active]])
        node[active] = next_node
        active = left[node] != -1

    return value[node]


def predict_ensemble_from_json(exported: dict, X: np.ndarray) -> np.ndarray:
    """Predict with one exported GradientBoostingRegressor (init + trees)."""
    preds = np.full(X.shape[0], exported["initValue"], dtype=float)
    for tree in exported["trees"]:
        preds += exported["learningRate"] * _tree_predict_vectorized(tree, X)
    return preds


def predict_point(artifact: dict, X: np.ndarray) -> np.ndarray:
    return predict_ensemble_from_json(artifact["pointEstimate"], X)


def predict_interval(artifact: dict, X: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    low = predict_ensemble_from_json(artifact["quantileLow"], X)
    high = predict_ensemble_from_json(artifact["quantileHigh"], X)
    return low, high


def predict_raw_confidence(artifact: dict, low: np.ndarray, high: np.ndarray) -> np.ndarray:
    """Maps [q10, q90] interval width to a monotonic (narrower-is-higher)
    raw confidence score, scaled between the 5th and 95th percentile of
    interval widths observed on the training set. This is NOT the final,
    reported confidence — it is an uncalibrated proxy, fed into
    predict_calibrated_confidence below, which is what's actually reported.
    It only needs to be a reasonable, monotonic ordering; isotonic
    regression fixes the actual scale against real observed accuracy on a
    disjoint calibration split, which is a stronger guarantee than any
    manual rescaling of this raw score could give on its own.

    (An earlier version used 0 as the implicit "most confident" anchor
    instead of the 5th percentile — interval widths never get close to 0
    in this dataset, so nearly every prediction landed near the top of that
    scale and raw confidence collapsed to near-zero for almost every row.
    That miscalibration is exactly what the isotonic map below corrects.)"""
    width = np.clip(high - low, 0, None)
    ref_low = artifact["confidenceReferenceWidthLowSeconds"]
    ref_high = artifact["confidenceReferenceWidthHighSeconds"]
    span = ref_high - ref_low
    normalized = np.clip((width - ref_low) / span, 0, 1) if span > 0 else np.zeros_like(width)
    ceiling = artifact["confidenceCeiling"]
    return ceiling * (1 - normalized)


def apply_isotonic(calibration_map: dict, raw: np.ndarray) -> np.ndarray:
    """Reproduce sklearn.isotonic.IsotonicRegression(out_of_bounds='clip')
    .predict() from its exported (X_thresholds_, y_thresholds_) — piecewise
    linear interpolation within the fitted domain, clipped to the boundary
    value outside it. Source (fetched and checked against the pinned
    scikit-learn==1.5.2 before writing this):
    https://scikit-learn.org/1.5/modules/generated/sklearn.isotonic.IsotonicRegression.html
    ("out_of_bounds='clip', predictions are set to the value corresponding
    to the nearest train interval endpoint")."""
    xt = np.asarray(calibration_map["xThresholds"])
    yt = np.asarray(calibration_map["yThresholds"])
    return np.interp(raw, xt, yt, left=yt[0], right=yt[-1])


def predict_calibrated_confidence(artifact: dict, low: np.ndarray, high: np.ndarray) -> np.ndarray:
    """The confidence value that should actually be reported: raw
    interval-width-based score, passed through the isotonic calibration map
    fit on the disjoint calibration split (ml/train.py)."""
    raw = predict_raw_confidence(artifact, low, high)
    return apply_isotonic(artifact["confidenceCalibration"], raw)
