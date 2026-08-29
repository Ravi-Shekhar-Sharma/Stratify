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
BASELINE_CSV = REPO_ROOT / "ml" / "data" / "baseline.csv"
ARTIFACT_PATH = REPO_ROOT / "ml" / "artifacts" / "soft_sensor.json"
METRICS_PATH = REPO_ROOT / "ml" / "artifacts" / "metrics.json"
CALIBRATION_PNG_PATH = REPO_ROOT / "ml" / "artifacts" / "calibration.png"

# Read from src/engine/assumptions.ts (docs/assumptions.md, "## ML
# modelling choices") — not hardcoded here. A station is "alerting" when
# its cycle time (predicted, or true for the ground-truth label) exceeds
# nominal by this fraction.
ALERT_MULTIPLIER = sensor.ml_constants()["alertMultiplier"]
_TAKT_SECONDS = sensor.ml_constants()["taktSeconds"]

# docs/assumptions.md, "## Buffers and work in progress": trim-to-chassis
# buffer nominal fill. Used only to compute a per-run analytical causal
# horizon for starvation pairing (below) — not a modelling choice, a
# physics figure already stated in the file.
_TRIM_BUFFER_NOMINAL_FILL = 2.5
# "e.g. <= 2x the nominal 415s" was the suggested example, but a single
# fixed horizon would be wrong here: marginal-severity incidents (as low as
# 1.10x nominal) drain far slower than the canonical 415s case (up to
# ~1,500-2,500s, confirmed empirically below) and a fixed 830s cutoff would
# wrongly exclude their genuine causal starvations. Each run's horizon is
# instead 2x ITS OWN analytically expected drain time, computed from that
# run's actual observed degraded cycle.
_CAUSAL_HORIZON_MULTIPLIER = 2.0


def expected_drain_seconds(degraded_cycle_seconds: float) -> float | None:
    """docs/assumptions.md's own derivation, generalised from the
    canonical 80s case to any degraded cycle: net drain rate = takt_rate -
    degraded_rate; time to empty = nominal_fill / net_rate. None if the
    degraded cycle isn't actually slower than takt (no net drain)."""
    net_rate = (1 / _TAKT_SECONDS) - (1 / degraded_cycle_seconds)
    if net_rate <= 0:
        return None
    return _TRIM_BUFFER_NOMINAL_FILL / net_rate


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


def compute_background_starvation_rate() -> dict:
    """Background/spontaneous S9 starvation rate from baseline.csv
    (incidentRate=0, no incident ever injected, anywhere). Establishes
    whether a starvation observed in the incident set could plausibly have
    happened anyway — used to sanity-check causal attribution, not asserted."""
    if not BASELINE_CSV.exists():
        return {"error": f"{BASELINE_CSV} does not exist"}
    df = pd.read_csv(BASELINE_CSV, usecols=["shiftSeed", "s9StarvationTicksAll"])
    per_shift = df.groupby("shiftSeed")["s9StarvationTicksAll"].first()
    has_starvation = per_shift.apply(lambda c: isinstance(c, str) and c != "")
    return {
        "baselineShifts": int(len(per_shift)),
        "shiftsWithSpontaneousStarvation": int(has_starvation.sum()),
        "backgroundStarvationRate": float(has_starvation.mean()),
    }


def compute_s6_s9_lead_time(artifact: dict, background_rate: float | None) -> dict:
    """THE headline evidence number: from the dedicated S6-forced evidence
    set, for each shift with an incident, find (a) the tick of the first
    S6 visit where the model's alert is a true positive, and (b) the FIRST
    S9 starvation tick that is causally attributable to this incident:
    at or after the exact injection tick (incidentAtTick), and within
    2x this run's own analytically expected drain time (not a single fixed
    horizon — marginal severities drain far slower than the canonical case
    and a fixed cutoff would wrongly exclude their genuine starvations; see
    expected_drain_seconds). Starvations before onset are never eligible,
    by construction (the search only considers ticks >= onset).

    Every candidate starvation tick is available (s9StarvationTicksAll,
    not just the first-ever) — this is the fix: the earlier version of
    this pipeline only had the simulation's own 'starved' event, which
    fires once per shift ever, so a run's ONLY recorded starvation could
    in principle be a pre-onset, incident-unrelated one, permanently
    mispairing every later real incident in that shift. Diagnosed against
    the actual worst runs before writing this: it turned out NOT to be
    happening (see the printed diagnostic in main()) — every starvation
    already present was already at or after true onset. The fix is applied
    anyway because it is still the structurally correct way to compute
    this, and it is what makes that finding checkable rather than assumed.

    Decomposed into detectionLagFromOnsetSeconds (alert_tick - onset,
    always modelled as >= 0 conceptually, how fast the model raises a true
    positive after the incident starts) and drainTimeFromOnsetSeconds
    (starvation_tick - onset, how fast the physical consequence occurs).
    leadTimeSeconds = drainTime - detectionLag exactly. This separates two
    different phenomena that a single lead-time number conflates: a fast,
    early-injected severe incident can drain before ANY vehicle has
    physically reached S6 to be observed (a detection-latency FLOOR, not a
    model failure); a marginal incident can drain at a normal pace while
    the alert itself takes a very long time to fire because near-threshold
    predictions take a long time to cross the line (a real detection
    weakness). Not clamped to be non-negative in either case."""
    if not EVIDENCE_CSV.exists():
        return {"error": f"{EVIDENCE_CSV} does not exist"}

    X, y_true, meta = sensor.load_features(EVIDENCE_CSV)
    X_np = X.to_numpy()
    y_pred = sensor.predict_point(artifact, X_np)

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
    # Three mutually exclusive outcomes per incident run, per band:
    fired_causal = {"easy": 0, "marginal": 0}       # alert fired, causal starvation found -> lead time counted
    fired_no_causal = {"easy": 0, "marginal": 0}    # alert fired, but no starvation within the causal horizon
    never_fired = {"easy": 0, "marginal": 0}        # alert never fired at all (recall failure)
    non_causal_excluded = {"easy": 0, "marginal": 0}  # starvation(s) exist but all are pre-onset (should be 0 - see diagnostic)

    for seed, group in df.groupby("shiftSeed"):
        group = group.sort_values("entryTick")
        incident_rows = group[group["trueIncidentActive"] == 1]
        if len(incident_rows) == 0:
            continue
        band = incident_rows.iloc[0]["severityBand"]
        onset_tick = float(group["incidentAtTick"].dropna().iloc[0])
        degraded_cycle_estimate = float(incident_rows["_true"].mean())
        horizon = expected_drain_seconds(degraded_cycle_estimate)
        horizon_seconds = _CAUSAL_HORIZON_MULTIPLIER * horizon if horizon else float("inf")

        all_starvation_ticks = sensor.parse_starvation_ticks(group["s9StarvationTicksAll"].iloc[0])
        eligible = [t for t in all_starvation_ticks if t >= onset_tick]
        pre_onset = [t for t in all_starvation_ticks if t < onset_tick]
        causal = [t for t in eligible if t - onset_tick <= horizon_seconds]

        true_positive_alerts = group[(group["trueIncidentActive"] == 1) & (group["_alert"])]
        fired = len(true_positive_alerts) > 0

        if not causal:
            if pre_onset and not eligible:
                non_causal_excluded[band] += 1
            elif fired:
                fired_no_causal[band] += 1
            else:
                never_fired[band] += 1
            continue

        if not fired:
            never_fired[band] += 1
            continue

        fired_causal[band] += 1
        alert_tick = float(true_positive_alerts.iloc[0]["entryTick"])
        starved_tick = causal[0]
        lead = starved_tick - alert_tick
        lead_times_by_band[band].append(lead)

        if worked_examples[band] is None:
            first_visit = true_positive_alerts.iloc[0]
            worked_examples[band] = {
                "shiftSeed": int(seed),
                "incidentAtTick": onset_tick,
                "alertVehicleId": int(first_visit["vehicleId"]),
                "alertEntryTick": alert_tick,
                "alertPredictedCycleSeconds": float(first_visit["_pred"]),
                "alertTrueCycleSeconds": float(first_visit["_true"]),
                "alertThresholdSeconds": float(first_visit["nominalCycleSeconds"] * ALERT_MULTIPLIER),
                "allStarvationTicksThisShift": all_starvation_ticks,
                "pairedStarvationTick": starved_tick,
                "causalHorizonSeconds": horizon_seconds,
                "detectionLagFromOnsetSeconds": alert_tick - onset_tick,
                "drainTimeFromOnsetSeconds": starved_tick - onset_tick,
                "leadTimeSeconds": lead,
            }

    def summarize(band: str) -> dict:
        lead_times = lead_times_by_band[band]
        total = fired_causal[band] + fired_no_causal[band] + never_fired[band] + non_causal_excluded[band]
        return {
            "runsWithCausalStarvationAndAlert": fired_causal[band],
            "runsAlertFiredNoCausalStarvation": fired_no_causal[band],
            "runsAlertNeverFired": never_fired[band],
            "runsOnlyNonCausalStarvationExcluded": non_causal_excluded[band],
            "totalIncidentRuns": total,
            "warningFireRate": (fired_causal[band] + fired_no_causal[band]) / total if total > 0 else None,
            "leadTimeConditionedOnCausalWarning": {
                "n": len(lead_times),
                "medianSeconds": float(np.median(lead_times)) if lead_times else None,
                "minSeconds": float(np.min(lead_times)) if lead_times else None,
                "maxSeconds": float(np.max(lead_times)) if lead_times else None,
                "allSeconds": lead_times,
            },
        }

    return {
        "definition": (
            "seconds from the soft sensor's first true-positive S6 alert to the first S9 "
            "starvation causally attributable to this incident (at/after exact injection tick, "
            "within 2x this run's own analytically expected drain time). Runs where the alert "
            "never fires, or no starvation occurs within the causal horizon, are excluded from the "
            "distribution and counted separately below (not differenced against a default tick). "
            "NOT clamped to be non-negative."
        ),
        "backgroundStarvationRate": background_rate,
        "byBand": {
            "easy": summarize("easy"),
            "marginal": summarize("marginal"),
        },
        "workedExampleByBand": worked_examples,
    }


def diagnose_worst_runs(artifact: dict, band: str, n: int = 5) -> list[dict]:
    """Prove-it: for the n most-negative runs in `band` (naive pairing, no
    causal filtering), print onset tick, alert tick, every starvation tick
    in that shift, and which one the naive method would have paired."""
    X, y_true, meta = sensor.load_features(EVIDENCE_CSV)
    X_np = X.to_numpy()
    y_pred = sensor.predict_point(artifact, X_np)
    alert_threshold = meta["nominalCycleSeconds"].to_numpy() * ALERT_MULTIPLIER
    alert = y_pred > alert_threshold

    df = meta.copy()
    df["_alert"] = alert
    df["_pred"] = y_pred
    df = df[(df["stationId"] == "S6").to_numpy()]

    rows = []
    for seed, group in df.groupby("shiftSeed"):
        group = group.sort_values("entryTick")
        incident_rows = group[group["trueIncidentActive"] == 1]
        if len(incident_rows) == 0 or incident_rows.iloc[0]["severityBand"] != band:
            continue
        onset_tick = float(group["incidentAtTick"].dropna().iloc[0])
        all_ticks = sensor.parse_starvation_ticks(group["s9StarvationTicksAll"].iloc[0])
        tp_alerts = group[(group["trueIncidentActive"] == 1) & (group["_alert"])]
        if len(tp_alerts) == 0 or not all_ticks:
            continue
        alert_tick = float(tp_alerts.iloc[0]["entryTick"])
        naive_paired = all_ticks[0]  # what the old, single-tick export would have paired
        rows.append({
            "shiftSeed": int(seed),
            "incidentAtTick": onset_tick,
            "alertTick": alert_tick,
            "allStarvationTicksThisShift": all_ticks,
            "naivePairedStarvationTick": naive_paired,
            "naiveLeadTimeSeconds": naive_paired - alert_tick,
            "naivePairedStarvationWasPreOnset": naive_paired < onset_tick,
        })

    rows.sort(key=lambda r: r["naiveLeadTimeSeconds"])
    return rows[:n]


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
    background = compute_background_starvation_rate()
    lead_time = compute_s6_s9_lead_time(artifact, background.get("backgroundStarvationRate"))
    s6_tracking = compute_s6_tracking(artifact)
    diagnostic_easy = diagnose_worst_runs(artifact, "easy")
    diagnostic_marginal = diagnose_worst_runs(artifact, "marginal")

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
        "backgroundStarvationRate": background,
        "s6S9LeadTime": lead_time,
        "worstRunDiagnostic": {"easy": diagnostic_easy, "marginal": diagnostic_marginal},
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

    print("\n=== Diagnostic: 5 most-negative runs under NAIVE (uncorrected) pairing ===")
    for band in ["easy", "marginal"]:
        print(f"  -- {band} band --")
        for r in (diagnostic_easy if band == "easy" else diagnostic_marginal):
            print(f"    shift {r['shiftSeed']}: onset={r['incidentAtTick']:.0f} "
                  f"alert={r['alertTick']:.0f} allStarvationTicks={r['allStarvationTicksThisShift']} "
                  f"naivePaired={r['naivePairedStarvationTick']:.0f} "
                  f"preOnset={r['naivePairedStarvationWasPreOnset']} "
                  f"naiveLead={r['naiveLeadTimeSeconds']:.0f}s")

    print(f"\nBackground starvation rate (no-incident baseline, {background.get('baselineShifts')} shifts): "
          f"{background.get('shiftsWithSpontaneousStarvation')} spontaneous starvations "
          f"({background.get('backgroundStarvationRate')})")

    print("\n=== S6 -> S9 starvation lead time, CAUSAL pairing (evidence set) ===")
    for band in ["easy", "marginal"]:
        b = lead_time["byBand"][band]
        lt = b["leadTimeConditionedOnCausalWarning"]
        print(f"  {band}: total runs={b['totalIncidentRuns']}  "
              f"causalStarvation+alert={b['runsWithCausalStarvationAndAlert']}  "
              f"alertFiredNoCausalStarvation={b['runsAlertFiredNoCausalStarvation']}  "
              f"alertNeverFired={b['runsAlertNeverFired']}  "
              f"onlyNonCausalStarvationExcluded={b['runsOnlyNonCausalStarvationExcluded']}  "
              f"fireRate={b['warningFireRate']}")
        print(f"    lead time | causal warning: n={lt['n']} median={lt['medianSeconds']}  "
              f"[{lt['minSeconds']}, {lt['maxSeconds']}]")
        we = lead_time.get("workedExampleByBand", {}).get(band)
        if we:
            print(f"    worked example (shift {we['shiftSeed']}): onset={we['incidentAtTick']:.0f} "
                  f"alert fired at tick {we['alertEntryTick']:.0f} (predicted "
                  f"{we['alertPredictedCycleSeconds']:.1f}s vs threshold {we['alertThresholdSeconds']:.1f}s), "
                  f"all starvation ticks this shift={we['allStarvationTicksThisShift']}, "
                  f"paired={we['pairedStarvationTick']:.0f} (horizon={we['causalHorizonSeconds']:.0f}s), "
                  f"detectionLagFromOnset={we['detectionLagFromOnsetSeconds']:.0f}s, "
                  f"drainTimeFromOnset={we['drainTimeFromOnsetSeconds']:.0f}s, "
                  f"leadTime={we['leadTimeSeconds']:.0f}s")

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
