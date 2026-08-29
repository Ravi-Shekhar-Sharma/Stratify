#!/usr/bin/env python3
"""Score the soft sensor. Three disjoint splits, three different jobs:

  train.csv     — only used here to print train MAE beside held-out MAE,
                   so the overfit gap is visible. Never re-fit anything.
  validate.csv  — the untouched scoring split. Baselines, skill, R²,
                   regime decomposition, per-band classification metrics,
                   and the reliability diagram all come from here.
  evidence.csv  — S6-forced incidents. The ONLY source for the S9-
                   starvation lead-time metric (ask: "the headline evidence
                   number"), because that metric is only meaningful for
                   incidents inside the trim segment feeding the
                   trim-to-chassis buffer, and S6 is the one the demo is
                   about. calibrate.csv was already consumed by train.py to
                   fit the confidence calibration map and is not read here.

Predictions are made by walking ml/artifacts/soft_sensor.json (ml/model.py),
the exact code path train.py used to self-check its own export.

Writes ml/artifacts/metrics.json and ml/artifacts/calibration.png.
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, precision_score, r2_score, recall_score

import model as sensor

REPO_ROOT = Path(__file__).resolve().parent.parent
TRAIN_CSV = REPO_ROOT / "ml" / "data" / "train.csv"
VALIDATE_CSV = REPO_ROOT / "ml" / "data" / "validate.csv"
EVIDENCE_CSV = REPO_ROOT / "ml" / "data" / "evidence.csv"
TRACKING_CSV = REPO_ROOT / "ml" / "data" / "tracking.csv"
ARTIFACT_PATH = REPO_ROOT / "ml" / "artifacts" / "soft_sensor.json"
METRICS_PATH = REPO_ROOT / "ml" / "artifacts" / "metrics.json"
CALIBRATION_PNG_PATH = REPO_ROOT / "ml" / "artifacts" / "calibration.png"

# Read from src/engine/assumptions.ts (docs/assumptions.md, "## ML
# modelling choices") — not hardcoded here. A station is "alerting" when
# its cycle time (predicted, or true for the ground-truth label) exceeds
# nominal by this fraction.
ALERT_MULTIPLIER = sensor.ml_constants()["alertMultiplier"]


def predict_all(artifact: dict, X_np: np.ndarray):
    y_pred = sensor.predict_point(artifact, X_np)
    low, high = sensor.predict_interval(artifact, X_np)
    confidence = sensor.predict_calibrated_confidence(artifact, low, high)
    return y_pred, low, high, confidence


def mae_overall_and_by(meta: pd.DataFrame, y_true: np.ndarray, y_pred: np.ndarray, group_col: str) -> dict:
    overall = float(mean_absolute_error(y_true, y_pred))
    by_group = {}
    for key, idx in meta.groupby(group_col).groups.items():
        idx = np.array(idx)
        by_group[str(key)] = float(mean_absolute_error(y_true[idx], y_pred[idx]))
    return {"overallSeconds": overall, "byGroupSeconds": by_group}


def compute_baselines(meta: pd.DataFrame, y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """(a) predict each station's OWN nominal cycle time AS STATED IN
    docs/assumptions.md — not a single global constant, and not simply the
    simulation's internal nominalCycleSeconds column. The two differ for
    exactly one station: the file's "## The demo incident" table states
    S6's nominal cycle as 55s, but the simulation paces S6's steady state
    at takt (54s) internally (see src/engine/stations.ts's note on why —
    the demo's own 415s derivation never uses 55 in its math). The
    assumptions-file number is what this baseline uses, station by
    station, via src/engine/assumptions.ts's S6_NOMINAL_CYCLE_SECONDS and
    TAKT_SECONDS (the file states no other per-station nominal, so every
    other target station uses takt, matching the simulation's own default).
    A naive version of this baseline that used the simulation's internal
    54s for S6 too is reported alongside as naiveGlobal54Comparison, so the
    inflation this fix corrects is visible, not asserted.
    (b) predict the station's own previous observed visit, within the same
    shift. Rows with no previous visit (first visit of that station in that
    shift) can't be scored against this baseline — reported as a
    coverage note, not silently dropped."""
    const = sensor.ml_constants()
    assumptions_nominal = meta["stationId"].map(
        lambda sid: const["s6NominalCycleSeconds"] if sid == "S6" else const["taktSeconds"]
    ).to_numpy(dtype=float)
    nominal_pred = assumptions_nominal
    nominal_mae = mae_overall_and_by(meta, y_true, nominal_pred, "stationId")

    # For comparison only — the naive version this replaces (54s for every
    # target station, including S6). Confirms whether/how much the fix
    # actually mattered, rather than asserting it.
    naive_nominal_pred = meta["nominalCycleSeconds"].to_numpy(dtype=float)
    naive_mae = mae_overall_and_by(meta, y_true, naive_nominal_pred, "stationId")
    naive_skill_overall = 1 - mean_absolute_error(y_true, y_pred) / naive_mae["overallSeconds"]
    nominal_skill = {
        "overall": 1 - mean_absolute_error(y_true, y_pred) / nominal_mae["overallSeconds"],
    }
    for sid, base_mae in nominal_mae["byGroupSeconds"].items():
        idx = meta.index[meta["stationId"] == sid]
        pos = meta.index.get_indexer(idx)
        model_mae_s = mean_absolute_error(y_true[pos], y_pred[pos])
        nominal_skill[sid] = 1 - model_mae_s / base_mae if base_mae > 0 else None

    df = meta.copy()
    df["_true"] = y_true
    df["_pred"] = y_pred
    df = df.sort_values(["shiftSeed", "stationId", "entryTick"]).reset_index(drop=True)
    df["_prevVisit"] = df.groupby(["shiftSeed", "stationId"])["_true"].shift(1)
    has_prev = df["_prevVisit"].notna()
    coverage = float(has_prev.mean())

    prev_true = df.loc[has_prev, "_true"].to_numpy()
    prev_pred_baseline = df.loc[has_prev, "_prevVisit"].to_numpy()
    prev_model_pred = df.loc[has_prev, "_pred"].to_numpy()
    prev_stations = df.loc[has_prev, "stationId"]

    previous_visit_mae = float(mean_absolute_error(prev_true, prev_pred_baseline))
    model_mae_on_prev_subset = float(mean_absolute_error(prev_true, prev_model_pred))
    previous_visit_skill = {
        "overall": 1 - model_mae_on_prev_subset / previous_visit_mae if previous_visit_mae > 0 else None,
    }
    previous_visit_by_station = {}
    for sid in prev_stations.unique():
        m = prev_stations == sid
        b_mae = float(mean_absolute_error(prev_true[m], prev_pred_baseline[m]))
        mo_mae = float(mean_absolute_error(prev_true[m], prev_model_pred[m]))
        previous_visit_by_station[sid] = b_mae
        previous_visit_skill[sid] = 1 - mo_mae / b_mae if b_mae > 0 else None

    r2_overall = float(r2_score(y_true, y_pred))
    r2_by_station = {}
    incident_rows_by_station = {}
    label_std_by_station = {}
    for sid, idx in meta.groupby("stationId").groups.items():
        idx = np.array(idx)
        if len(idx) >= 2:
            r2_by_station[str(sid)] = float(r2_score(y_true[idx], y_pred[idx]))
        incident_rows_by_station[str(sid)] = int((meta.loc[idx, "trueIncidentActive"] == 1).sum())
        label_std_by_station[str(sid)] = float(np.std(y_true[idx]))

    return {
        "r2CaveatNote": (
            "R2 and skill score per station are only meaningful where the "
            "held-out split actually contains incident-affected rows for "
            "that station (see incidentRowsByStation / labelStdByStation "
            "below) - a station with zero incident rows in this split has "
            "no non-jitter variance to explain, so a near-zero R2 there "
            "reflects the split's random incident assignment, not "
            "necessarily worse model skill at that station."
        ),
        "incidentRowsByStation": incident_rows_by_station,
        "labelStdByStation": label_std_by_station,
        "nominalCycleBaseline": {
            "description": "predicts each station's own nominal cycle time as stated in docs/assumptions.md (S6=55s from the demo-incident table, every other target station=54s/takt, the file's only other stated timing figure) - per-station, not a single global constant",
            "maeSeconds": nominal_mae,
            "skillScore": nominal_skill,
            "naiveGlobal54Comparison": {
                "description": "what this baseline would report if it incorrectly used the simulation's internal 54s for S6 too, instead of the assumptions file's stated 55s - kept for comparison, not used for the reported skill score",
                "maeSecondsOverall": naive_mae["overallSeconds"],
                "skillScoreOverall": naive_skill_overall,
            },
        },
        "previousVisitBaseline": {
            "description": "predicts the same station's immediately preceding observed visit within the same shift",
            "rowCoverage": coverage,
            "rowCoverageNote": "fraction of held-out rows with a previous visit at the same station in the same shift; the rest have no defined prediction under this baseline and are excluded from it",
            "maeSecondsOverall": previous_visit_mae,
            "maeSecondsByStation": previous_visit_by_station,
            "modelMaeOnSameSubsetSeconds": model_mae_on_prev_subset,
            "skillScore": previous_visit_skill,
        },
        "r2": {"overall": r2_overall, "byStation": r2_by_station},
    }


def compute_regime_decomposition(train_meta, train_y, train_pred,
                                  val_meta, val_y, val_pred) -> dict:
    """Steady state (no incident active at this station/visit) vs incident
    tracking (an injected degradation IS active), held-out only for the
    regime split — train MAE is printed alongside as a single overall/
    per-station number (not split by regime) so the overfit gap is
    visible without conflating it with the regime question."""
    def by_regime(meta, y_true, y_pred):
        out = {}
        for label, mask in [("steadyState", meta["trueIncidentActive"] == 0),
                             ("incidentTracking", meta["trueIncidentActive"] == 1)]:
            idx = np.where(mask.to_numpy())[0]
            if len(idx) == 0:
                out[label] = {"overallSeconds": None, "byStationSeconds": {}, "n": 0}
                continue
            overall = float(mean_absolute_error(y_true[idx], y_pred[idx]))
            by_station = {}
            sub_meta = meta.iloc[idx]
            for sid, sidx in sub_meta.groupby("stationId").groups.items():
                pos = meta.index.get_indexer(sidx)
                by_station[str(sid)] = float(mean_absolute_error(y_true[pos], y_pred[pos]))
            out[label] = {"overallSeconds": overall, "byStationSeconds": by_station, "n": int(len(idx))}
        return out

    return {
        "trainMae": mae_overall_and_by(train_meta, train_y, train_pred, "stationId"),
        "heldOutMae": mae_overall_and_by(val_meta, val_y, val_pred, "stationId"),
        "heldOutByRegime": by_regime(val_meta, val_y, val_pred),
    }


def compute_alert_metrics_by_band(meta: pd.DataFrame, y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    """Precision/recall/false-alarm rate, computed separately for the easy
    band (1.3x-2.0x nominal, clearly separable) and the marginal band
    (1.10x-1.25x, close enough to jitter noise to be a real test). Ground
    truth ("is this row actually under an incident") comes from
    trueIncidentActive + severityBand, not re-derived from a threshold on
    the noisy label."""
    alert_threshold = meta["nominalCycleSeconds"].to_numpy() * ALERT_MULTIPLIER
    alert = y_pred > alert_threshold

    result = {"alertMultiplier": ALERT_MULTIPLIER}
    steady_mask = (meta["severityBand"] == "none").to_numpy()

    for band in ["easy", "marginal"]:
        band_mask = (meta["severityBand"] == band).to_numpy()
        eval_mask = band_mask | steady_mask  # this band's incidents vs all steady-state rows
        truth = band_mask[eval_mask]
        pred = alert[eval_mask]
        tn = int(np.sum(~truth & ~pred))
        fp = int(np.sum(~truth & pred))
        precision = float(precision_score(truth, pred, zero_division=0))
        recall = float(recall_score(truth, pred, zero_division=0))
        far = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
        result[band] = {
            "n": int(eval_mask.sum()),
            "nPositive": int(truth.sum()),
            "precision": precision,
            "recall": recall,
            "falseAlarmRate": far,
        }
    result["falseAlarmRateDefinition"] = "FP / (FP + TN) at visit level, TN/FP measured against steady-state (severityBand='none') rows"
    return result


def compute_s6_s9_lead_time(artifact: dict) -> dict:
    """THE headline evidence number: from the dedicated S6-forced evidence
    set, for each shift with an incident, find (a) the tick of the first
    S6 visit where the model's alert fires AND the incident is genuinely
    active (a true positive alert on S6), and (b) the tick S9 first
    starves (ground truth, from the trim-to-chassis buffer emptying).
    Lead time = starvation tick - alert tick. Positive means the alert
    fired before S9 actually starved; negative means starvation was
    already underway before the model caught it. Both are reported
    as-is — this is not clamped to be non-negative.

    Conditioning, made explicit rather than implicit: a run where the
    alert never fires is a recall failure — already counted in the alert
    metrics — and is EXCLUDED from this distribution entirely, never
    differenced against a fallback/default tick. "warningFireRate" and
    the fired/notFired counts below are how you check that this is
    honest conditioning, not silent cherry-picking of favorable runs."""
    if not EVIDENCE_CSV.exists():
        return {"error": f"{EVIDENCE_CSV} does not exist"}

    X, y_true, meta = sensor.load_features(EVIDENCE_CSV)
    X_np = X.to_numpy()
    y_pred, low, high, confidence = predict_all(artifact, X_np)

    s6_mask = (meta["stationId"] == "S6").to_numpy()
    alert_threshold = meta["nominalCycleSeconds"].to_numpy() * ALERT_MULTIPLIER
    alert = y_pred > alert_threshold

    df = meta.copy()
    df["_alert"] = alert
    df["_pred"] = y_pred
    df["_true"] = y_true
    df = df[s6_mask]

    lead_times_by_band: dict[str, list[float]] = {"easy": [], "marginal": []}
    worked_examples: dict[str, dict | None] = {"easy": None, "marginal": None}
    shifts_with_incident = 0
    shifts_with_starvation = 0
    shifts_with_alert = 0
    shifts_with_both = 0
    # Runs excluded from the lead-time distribution because the alert never
    # fired at all — recall failures, counted here explicitly so the
    # conditioning below is checkable, not asserted.
    excluded_no_alert_by_band = {"easy": 0, "marginal": 0}
    excluded_no_starvation = 0

    for seed, group in df.groupby("shiftSeed"):
        group = group.sort_values("entryTick")
        incident_rows = group[group["trueIncidentActive"] == 1]
        if len(incident_rows) == 0:
            continue
        shifts_with_incident += 1
        band = incident_rows.iloc[0]["severityBand"]

        starved_tick = group["s9StarvedTick"].dropna()
        has_starvation = len(starved_tick) > 0 and not pd.isna(starved_tick.iloc[0])
        if has_starvation:
            shifts_with_starvation += 1
            starved_tick_val = float(starved_tick.iloc[0])
        else:
            excluded_no_starvation += 1
            continue

        true_positive_alerts = group[(group["trueIncidentActive"] == 1) & (group["_alert"])]
        if len(true_positive_alerts) == 0:
            excluded_no_alert_by_band[band] += 1
            continue
        shifts_with_alert += 1
        alert_tick = float(true_positive_alerts.iloc[0]["entryTick"])

        shifts_with_both += 1
        lead = starved_tick_val - alert_tick
        lead_times_by_band[band].append(lead)

        if worked_examples[band] is None:
            first_visit = true_positive_alerts.iloc[0]
            worked_examples[band] = {
                "shiftSeed": int(seed),
                "alertVehicleId": int(first_visit["vehicleId"]),
                "alertEntryTick": alert_tick,
                "alertPredictedCycleSeconds": float(first_visit["_pred"]),
                "alertTrueCycleSeconds": float(first_visit["_true"]),
                "alertThresholdSeconds": float(first_visit["nominalCycleSeconds"] * ALERT_MULTIPLIER),
                "s9StarvedTick": starved_tick_val,
                "leadTimeSeconds": lead,
            }

    def summarize(band: str) -> dict:
        lead_times = lead_times_by_band[band]
        fired = len(lead_times)
        not_fired = excluded_no_alert_by_band[band]
        denom = fired + not_fired
        return {
            "runsIncludedFired": fired,
            "runsExcludedNeverFired": not_fired,
            "warningFireRate": fired / denom if denom > 0 else None,
            "leadTimeConditionedOnWarning": {
                "medianSeconds": float(np.median(lead_times)) if lead_times else None,
                "minSeconds": float(np.min(lead_times)) if lead_times else None,
                "maxSeconds": float(np.max(lead_times)) if lead_times else None,
                "allSeconds": lead_times,
            },
        }

    return {
        "definition": (
            "seconds from the soft sensor's first true-positive S6 alert to S9's first starved "
            "tick (ground truth) in the same shift, CONDITIONED ON a warning having fired at all. "
            "Runs where no alert ever fired are excluded from the distribution (they are recall "
            "failures, counted separately as runsExcludedNeverFired / warningFireRate below), not "
            "differenced against a default/fallback tick. NOT clamped to be non-negative."
        ),
        "evidenceShifts": int(df["shiftSeed"].nunique()),
        "shiftsWithIncident": shifts_with_incident,
        "shiftsWhereS9Starved": shifts_with_starvation,
        "shiftsExcludedS9NeverStarved": excluded_no_starvation,
        "byBand": {
            "easy": summarize("easy"),
            "marginal": summarize("marginal"),
        },
        "workedExampleByBand": worked_examples,
    }


def compute_s6_tracking(artifact: dict) -> dict:
    """Does the soft sensor actually track S6's degradation, or not?
    Dedicated fixed-severity set (tracking.csv — every shift forces S6 to
    the canonical degraded cycle, not a random severity), so results
    aren't averaged across a mix of easy/marginal incidents. Reported by
    visitIndexSinceIncident (0 = the first visit after the true cycle time
    changed, 1 = the next, ...), not by simulation tick — the model
    produces one prediction per station visit, not per second, so "per
    tick" is reinterpreted as "per successive visit since onset" and
    stated as such rather than silently relabelled."""
    if not TRACKING_CSV.exists():
        return {"error": f"{TRACKING_CSV} does not exist - run ml/generate.py first"}

    X, y_true, meta = sensor.load_features(TRACKING_CSV)
    X_np = X.to_numpy()
    y_pred = sensor.predict_point(artifact, X_np)

    s6_mask = (meta["stationId"] == "S6").to_numpy()
    df = meta[s6_mask].copy()
    df["_pred"] = y_pred[s6_mask]
    df["_true"] = y_true[s6_mask]

    steady = df[df["trueIncidentActive"] == 0]
    steady_mae = float(mean_absolute_error(steady["_true"], steady["_pred"])) if len(steady) else None

    incident = df[df["trueIncidentActive"] == 1].copy()
    by_index = []
    for idx, group in incident.groupby("visitIndexSinceIncident"):
        if pd.isna(idx):
            continue
        by_index.append({
            "visitIndexSinceIncident": int(idx),
            "n": int(len(group)),
            "meanPredictedCycleSeconds": float(group["_pred"].mean()),
            "meanTrueCycleSeconds": float(group["_true"].mean()),
            "maeSeconds": float(mean_absolute_error(group["_true"], group["_pred"])),
        })
    by_index.sort(key=lambda r: r["visitIndexSinceIncident"])

    overall_incident_mae = float(mean_absolute_error(incident["_true"], incident["_pred"])) if len(incident) else None

    return {
        "trackingShifts": int(df["shiftSeed"].nunique()),
        "forcedDegradedCycleSeconds": float(incident["_true"].iloc[0]) if len(incident) else None,
        "steadyStateMaeSeconds": steady_mae,
        "overallIncidentTrackingMaeSeconds": overall_incident_mae,
        "byVisitIndexSinceIncident": by_index,
    }


def compute_calibration(confidence: np.ndarray, is_correct: np.ndarray) -> list[dict]:
    edges = [0.0, 0.3, 0.45, 0.55, 0.65, 0.72, 0.78, 0.83, 0.87, 0.90, 1.0]
    points = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (confidence >= lo) & (confidence < hi)
        n = int(np.sum(mask))
        if n == 0:
            continue
        points.append({
            "confidenceBucketLow": lo,
            "confidenceBucketHigh": hi,
            "meanPredictedConfidence": float(np.mean(confidence[mask])),
            "observedAccuracy": float(np.mean(is_correct[mask])),
            "n": n,
        })
    return points


def plot_calibration(points: list[dict], tolerance: float, path: Path) -> None:
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.plot([0, 1], [0, 1], linestyle="--", color="gray", label="perfect calibration")
    xs = [p["meanPredictedConfidence"] for p in points]
    ys = [p["observedAccuracy"] for p in points]
    sizes = [max(20, min(400, p["n"] / 5)) for p in points]
    ax.scatter(xs, ys, s=sizes, color="#2166ac", zorder=3, label="soft sensor (size = n)")
    ax.plot(xs, ys, color="#2166ac", alpha=0.5, zorder=2)
    ax.set_xlabel("Mean calibrated confidence")
    ax.set_ylabel(f"Observed accuracy (within {tolerance:.2f}s)")
    ax.set_title("Soft sensor calibration — held-out validation shifts\n(isotonic-calibrated, fit on a disjoint split)")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    for p in [TRAIN_CSV, VALIDATE_CSV, ARTIFACT_PATH]:
        if not p.exists():
            raise SystemExit(f"{p} does not exist - run ml/generate.py and ml/train.py first.")

    artifact = json.loads(ARTIFACT_PATH.read_text())
    tolerance = artifact["confidenceCalibration"]["toleranceSeconds"]

    X_train, y_train, meta_train = sensor.load_features(TRAIN_CSV)
    train_pred = sensor.predict_point(artifact, X_train.to_numpy())

    X_val, y_val, meta_val = sensor.load_features(VALIDATE_CSV)
    X_val_np = X_val.to_numpy()
    val_pred, val_low, val_high, val_confidence = predict_all(artifact, X_val_np)

    print(f"Train rows: {len(X_train)}  Validation rows: {len(X_val)} "
          f"(seeds {meta_val['shiftSeed'].min()}..{meta_val['shiftSeed'].max()})")

    baselines = compute_baselines(meta_val, y_val, val_pred)
    regimes = compute_regime_decomposition(meta_train, y_train, train_pred, meta_val, y_val, val_pred)
    alert_bands = compute_alert_metrics_by_band(meta_val, y_val, val_pred)
    lead_time = compute_s6_s9_lead_time(artifact)
    s6_tracking = compute_s6_tracking(artifact)

    val_is_correct = (np.abs(val_pred - y_val) <= tolerance).astype(float)
    calibration = compute_calibration(val_confidence, val_is_correct)

    tier_breakdown = {}
    for tier, idx in meta_val.groupby("tier").groups.items():
        idx = np.array(idx)
        tier_breakdown[tier] = {
            "n": int(len(idx)),
            "maeSeconds": float(mean_absolute_error(y_val[idx], val_pred[idx])),
            "meanConfidence": float(np.mean(val_confidence[idx])),
            "medianConfidence": float(np.median(val_confidence[idx])),
        }

    metrics = {
        "validationRows": len(X_val),
        "trainRows": len(X_train),
        "validationShiftSeeds": [int(meta_val["shiftSeed"].min()), int(meta_val["shiftSeed"].max())],
        "calibrationToleranceSeconds": tolerance,
        "calibrationToleranceDerivation": artifact["confidenceCalibration"]["toleranceDerivation"],
        "baselines": baselines,
        "regimeDecomposition": regimes,
        "alertMetricsByBand": alert_bands,
        "s6S9LeadTime": lead_time,
        "s6Tracking": s6_tracking,
        "calibration": calibration,
        "perTier": tier_breakdown,
    }

    METRICS_PATH.write_text(json.dumps(metrics, indent=2, default=str))
    plot_calibration(calibration, tolerance, CALIBRATION_PNG_PATH)

    print(f"\nWrote {METRICS_PATH}")
    print(f"Wrote {CALIBRATION_PNG_PATH}")

    print("\n=== Baselines and skill (held-out) ===")
    print(f"Model MAE overall: {mean_absolute_error(y_val, val_pred):.2f}s  R2: {baselines['r2']['overall']:.3f}")
    print(f"Nominal-cycle baseline MAE: {baselines['nominalCycleBaseline']['maeSeconds']['overallSeconds']:.2f}s  "
          f"skill: {baselines['nominalCycleBaseline']['skillScore']['overall']:.3f}  "
          f"(per-station from docs/assumptions.md: S6=55s, others=54s/takt)")
    naive = baselines["nominalCycleBaseline"]["naiveGlobal54Comparison"]
    print(f"  [naive global-54s version, for comparison: MAE {naive['maeSecondsOverall']:.2f}s  "
          f"skill {naive['skillScoreOverall']:.3f}]")
    print(f"Previous-visit baseline MAE: {baselines['previousVisitBaseline']['maeSecondsOverall']:.2f}s  "
          f"(coverage {baselines['previousVisitBaseline']['rowCoverage']:.1%})  "
          f"skill: {baselines['previousVisitBaseline']['skillScore']['overall']:.3f}")

    print("\n=== Per-station R2 and skill (CAVEAT: only meaningful with incident coverage) ===")
    for sid in sorted(baselines["incidentRowsByStation"]):
        n_inc = baselines["incidentRowsByStation"][sid]
        r2_s = baselines["r2"]["byStation"].get(sid)
        skill_s = baselines["nominalCycleBaseline"]["skillScore"].get(sid)
        flag = "  <-- ZERO incident rows in validation, R2 not meaningful here" if n_inc == 0 else ""
        print(f"  {sid}: incidentRows={n_inc} R2={r2_s:.3f} skillVsNominal={skill_s:.3f}{flag}")

    print("\n=== Train vs held-out MAE (overfit gap) ===")
    print(f"Train:    {regimes['trainMae']['overallSeconds']:.2f}s")
    print(f"Held-out: {regimes['heldOutMae']['overallSeconds']:.2f}s")

    print("\n=== Regime decomposition (held-out) ===")
    ss = regimes["heldOutByRegime"]["steadyState"]
    it = regimes["heldOutByRegime"]["incidentTracking"]
    print(f"Steady state:      MAE {ss['overallSeconds']:.2f}s  n={ss['n']}")
    print(f"Incident tracking: MAE {it['overallSeconds']:.2f}s  n={it['n']}")

    print("\n=== Alert metrics by severity band (held-out) ===")
    for band in ["easy", "marginal"]:
        b = alert_bands[band]
        print(f"{band}: n={b['n']} positives={b['nPositive']} precision={b['precision']:.3f} "
              f"recall={b['recall']:.3f} falseAlarmRate={b['falseAlarmRate']:.3f}")

    print("\n=== S6 -> S9 starvation lead time, CONDITIONED ON a warning firing (evidence set) ===")
    print(f"Evidence shifts with an incident: {lead_time['shiftsWithIncident']}  "
          f"(S9 starved in {lead_time['shiftsWhereS9Starved']}, "
          f"never starved in {lead_time['shiftsExcludedS9NeverStarved']})")
    for band in ["easy", "marginal"]:
        b = lead_time["byBand"][band]
        lt = b["leadTimeConditionedOnWarning"]
        print(f"  {band}: fire rate={b['warningFireRate']}  "
              f"(included/fired={b['runsIncludedFired']}, excluded/neverFired={b['runsExcludedNeverFired']})")
        print(f"    lead time | warning fired: median={lt['medianSeconds']}  "
              f"[{lt['minSeconds']}, {lt['maxSeconds']}]")
        we = lead_time.get("workedExampleByBand", {}).get(band)
        if we:
            print(f"    worked example (shift {we['shiftSeed']}): alert fired at tick "
                  f"{we['alertEntryTick']:.0f} (predicted {we['alertPredictedCycleSeconds']:.1f}s vs "
                  f"threshold {we['alertThresholdSeconds']:.1f}s), S9 starved at tick "
                  f"{we['s9StarvedTick']:.0f}, lead time = {we['leadTimeSeconds']:.0f}s")

    print("\n=== S6 tracking: does the prediction follow the true degradation? ===")
    print(f"Tracking shifts: {s6_tracking.get('trackingShifts')}  "
          f"forced degraded cycle: {s6_tracking.get('forcedDegradedCycleSeconds')}s  "
          f"steady-state MAE: {s6_tracking.get('steadyStateMaeSeconds')}  "
          f"overall incident-tracking MAE: {s6_tracking.get('overallIncidentTrackingMaeSeconds')}")
    print("visitIndexSinceIncident | n | meanPredicted | meanTrue | MAE")
    for row in s6_tracking.get("byVisitIndexSinceIncident", [])[:15]:
        print(f"  {row['visitIndexSinceIncident']:>2} | {row['n']:>4} | "
              f"{row['meanPredictedCycleSeconds']:>6.2f} | {row['meanTrueCycleSeconds']:>6.2f} | "
              f"{row['maeSeconds']:>5.2f}")

    print("\n=== Per-tier breakdown ===")
    for tier, v in tier_breakdown.items():
        print(f"  {tier}: n={v['n']} MAE={v['maeSeconds']:.2f}s meanConfidence={v['meanConfidence']:.3f}")


if __name__ == "__main__":
    main()
