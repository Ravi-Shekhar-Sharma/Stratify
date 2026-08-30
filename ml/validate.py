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
# Sidecar outputs of src/engine/ml/computeAlertColumn.ts — the ONE place the
# alert (predictedCycleSeconds > threshold, debounced) is computed, shared
# with the live UI. Derived, gitignored like the rest of ml/data/*.csv.
VALIDATE_ALERT_CSV = REPO_ROOT / "ml" / "data" / "validate_alert.csv"
EVIDENCE_ALERT_CSV = REPO_ROOT / "ml" / "data" / "evidence_alert.csv"

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


def compute_alert_metrics_by_band(meta: pd.DataFrame) -> dict:
    """Precision/recall/false-alarm rate, computed separately for the easy
    band (1.3x-2.0x nominal, clearly separable) and the marginal band
    (1.10x-1.25x, close enough to jitter noise to be a real test). Ground
    truth ("is this row actually under an incident") comes from
    trueIncidentActive + severityBand, not re-derived from a threshold on
    the noisy label.

    `alert` comes from meta["alertActive"] — the UNIFIED alert column
    (see model.py's compute_alert_column / merge_alert_column), computed
    once in TypeScript by src/engine/inference/alertSignal.ts and shared
    with the live UI. This function used to compute `y_pred > threshold`
    itself, undebounced, directly in Python — a second implementation of
    "what counts as an alert" that could (and did) disagree with what the
    browser actually shows. It no longer takes y_pred/threshold at all."""
    alert = meta["alertActive"].to_numpy()

    result = {"alertMultiplier": ALERT_MULTIPLIER, "alertMinHold": sensor.ml_constants()["alertMinHold"]}
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


def compute_s6_s9_lead_time(evidence: pd.DataFrame, background_rate: float | None) -> dict:
    """THE headline evidence number — now TWO of them, reconciled with the
    live UI rather than reported as one that quietly meant something the
    product can't deliver.

    'deliverable': the lead time as a live system could actually act on
    it. The alert tick is availableTick (see model.py's compute_alert_column
    and src/engine/ml/computeAlertColumn.ts's docstring for why a
    prediction isn't available at entryTick — it needs the downstream
    visit's dwell, a model feature, to have completed first) and "fired" is
    the UNIFIED, debounced alertActive column — the exact same
    resolveAlertSequence + ALERT_MIN_HOLD the browser's classifyStation
    uses. This is the number that belongs on a deck claiming what the
    product delivers.

    'physicalHeadroom': the ORIGINAL computation, unchanged — raw
    `predictedCycleSeconds > threshold` at entryTick, no debounce, no
    availability lag. Kept as a separate, clearly labeled line: it answers
    "how much physical time exists between the earliest a vehicle carrying
    signal reaches S6 and the buffer running dry," which is a real, useful
    number — it is just not what a live, no-look-ahead system can turn into
    a warning, so it must never be quoted as the product's lead time.

    Both use the SAME causal-starvation pairing (see expected_drain_seconds
    and the causal horizon derivation) and the SAME four-outcome bucketing,
    computed independently per definition since "did it fire, and when"
    differs between them.

    Every candidate starvation tick is available (s9StarvationTicksAll,
    not just the first-ever) — see the git history on this function for why
    that fix mattered; it is unchanged by the deliverable/headroom split.

    leadTimeSeconds = drainTime - detectionLag exactly, decomposed the same
    way for both definitions. Not clamped to be non-negative in either."""
    if evidence is None:
        return {"error": f"{EVIDENCE_CSV} does not exist"}

    df = evidence[(evidence["stationId"] == "S6").to_numpy()].copy()

    def new_band_dict():
        return {"easy": [], "marginal": []}

    lead_times = {"deliverable": new_band_dict(), "physicalHeadroom": new_band_dict()}
    worked_examples = {"deliverable": {"easy": None, "marginal": None}, "physicalHeadroom": {"easy": None, "marginal": None}}
    fired_causal = {"deliverable": {"easy": 0, "marginal": 0}, "physicalHeadroom": {"easy": 0, "marginal": 0}}
    fired_no_causal = {"deliverable": {"easy": 0, "marginal": 0}, "physicalHeadroom": {"easy": 0, "marginal": 0}}
    never_fired = {"deliverable": {"easy": 0, "marginal": 0}, "physicalHeadroom": {"easy": 0, "marginal": 0}}
    non_causal_excluded = {"deliverable": {"easy": 0, "marginal": 0}, "physicalHeadroom": {"easy": 0, "marginal": 0}}

    for seed, group in df.groupby("shiftSeed"):
        group = group.sort_values("entryTick")
        incident_rows = group[group["trueIncidentActive"] == 1]
        if len(incident_rows) == 0:
            continue
        band = incident_rows.iloc[0]["severityBand"]
        onset_tick = float(group["incidentAtTick"].dropna().iloc[0])
        degraded_cycle_estimate = float(incident_rows["trueCycleSeconds"].mean())
        horizon = expected_drain_seconds(degraded_cycle_estimate)
        horizon_seconds = _CAUSAL_HORIZON_MULTIPLIER * horizon if horizon else float("inf")

        all_starvation_ticks = sensor.parse_starvation_ticks(group["s9StarvationTicksAll"].iloc[0])
        eligible = [t for t in all_starvation_ticks if t >= onset_tick]
        pre_onset = [t for t in all_starvation_ticks if t < onset_tick]
        causal = [t for t in eligible if t - onset_tick <= horizon_seconds]
        starved_tick = causal[0] if causal else None

        headroom_threshold = float(group["nominalCycleSeconds"].iloc[0]) * ALERT_MULTIPLIER
        definitions = {
            "deliverable": {
                "mask": (group["trueIncidentActive"] == 1) & (group["alertActive"]),
                "tick_col": "availableTick",
            },
            "physicalHeadroom": {
                "mask": (group["trueIncidentActive"] == 1) & (group["predictedCycleSeconds"] > headroom_threshold),
                "tick_col": "entryTick",
            },
        }

        for name, spec in definitions.items():
            matches = group[spec["mask"]]
            fired = len(matches) > 0

            if not causal:
                if pre_onset and not eligible:
                    non_causal_excluded[name][band] += 1
                elif fired:
                    fired_no_causal[name][band] += 1
                else:
                    never_fired[name][band] += 1
                continue

            if not fired:
                never_fired[name][band] += 1
                continue

            fired_causal[name][band] += 1
            first_match = matches.iloc[0]
            alert_tick = float(first_match[spec["tick_col"]])
            lead = starved_tick - alert_tick
            lead_times[name][band].append(lead)

            if worked_examples[name][band] is None:
                worked_examples[name][band] = {
                    "shiftSeed": int(seed),
                    "incidentAtTick": onset_tick,
                    "alertVehicleId": int(first_match["vehicleId"]),
                    "alertTick": alert_tick,
                    "alertTickBasis": spec["tick_col"],
                    "alertPredictedCycleSeconds": float(first_match["predictedCycleSeconds"]),
                    "alertThresholdSeconds": float(first_match["nominalCycleSeconds"]) * ALERT_MULTIPLIER,
                    "allStarvationTicksThisShift": all_starvation_ticks,
                    "pairedStarvationTick": starved_tick,
                    "causalHorizonSeconds": horizon_seconds,
                    "detectionLagFromOnsetSeconds": alert_tick - onset_tick,
                    "drainTimeFromOnsetSeconds": starved_tick - onset_tick,
                    "leadTimeSeconds": lead,
                }

    def summarize(name: str, band: str) -> dict:
        lt = lead_times[name][band]
        total = fired_causal[name][band] + fired_no_causal[name][band] + never_fired[name][band] + non_causal_excluded[name][band]
        return {
            "runsWithCausalStarvationAndAlert": fired_causal[name][band],
            "runsAlertFiredNoCausalStarvation": fired_no_causal[name][band],
            "runsAlertNeverFired": never_fired[name][band],
            "runsOnlyNonCausalStarvationExcluded": non_causal_excluded[name][band],
            "totalIncidentRuns": total,
            "warningFireRate": (fired_causal[name][band] + fired_no_causal[name][band]) / total if total > 0 else None,
            "leadTimeConditionedOnCausalWarning": {
                "n": len(lt),
                "medianSeconds": float(np.median(lt)) if lt else None,
                "minSeconds": float(np.min(lt)) if lt else None,
                "maxSeconds": float(np.max(lt)) if lt else None,
                "allSeconds": lt,
            },
        }

    def bundle(name: str, definition_text: str) -> dict:
        return {
            "definition": definition_text,
            "byBand": {"easy": summarize(name, "easy"), "marginal": summarize(name, "marginal")},
            "workedExampleByBand": worked_examples[name],
        }

    return {
        "backgroundStarvationRate": background_rate,
        "deliverable": bundle(
            "deliverable",
            "Seconds from the UNIFIED alert (src/engine/inference/alertSignal.ts's "
            "resolveAlertSequence + ALERT_MIN_HOLD debounce, same signal the live UI "
            "commits its Degrading tile on) becoming available (availableTick, not "
            "entryTick - a prediction needs the downstream visit's dwell, so it cannot "
            "exist before that visit completes) to the first causally-attributable S9 "
            "starvation. This is what the product can actually warn a person with.",
        ),
        "physicalHeadroom": bundle(
            "physicalHeadroom",
            "Seconds from the raw predicted-cycle threshold crossing at entryTick "
            "(undebounced, no availability lag) to the first causally-attributable S9 "
            "starvation. NOT achievable by a live system - kept as a separate, clearly "
            "labeled figure for physical headroom in the process, not a product claim.",
        ),
    }


def diagnose_worst_runs(evidence: pd.DataFrame, band: str, n: int = 5) -> list[dict]:
    """Prove-it: for the n most-negative runs in `band` (naive pairing, no
    causal filtering), print onset tick, alert tick, every starvation tick
    in that shift, and which one the naive method would have paired.

    Deliberately still uses the physicalHeadroom definition (raw predicted
    threshold at entryTick, undebounced) — this diagnostic exists to check
    the CAUSAL STARVATION PAIRING logic, not the alert-timing question the
    deliverable/physicalHeadroom split is about, so it doesn't need the
    unified alert column."""
    alert_threshold = evidence["nominalCycleSeconds"].to_numpy() * ALERT_MULTIPLIER
    alert = evidence["predictedCycleSeconds"].to_numpy() > alert_threshold

    df = evidence.copy()
    df["_alert"] = alert
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


def compute_station_shift_operations(meta: pd.DataFrame, y_true: np.ndarray, shift_seconds: float) -> list[dict]:
    """Per (station, shift) operational summary for the plant-manager
    weekly-horizon view: a recurring-bottleneck rate and two of ISO
    22400-2's three OEE factors, computed only from timing this engine
    already produces (entry/exit ticks, nominal cycle time) - no new
    simulation logic.

    Ground truth (y_true), not the model's prediction: this view reports
    what actually happened on the (simulated) floor, not the soft sensor's
    inferred estimate of it - the model-confidence story belongs to the
    Trust view, not this one.

    bottleneckRate: fraction of this station's visits in this shift whose
    true cycle time exceeded nominal x ALERT_MULTIPLIER - the same
    threshold used everywhere else in this codebase for "this station is
    running hot."

    availability = Operating Time / Planned Production Time (ISO 22400-2).
    Operating Time is this station's own visit durations (exitTick -
    entryTick) summed over the shift; Planned Production Time is the full
    shift (shift_seconds).

    performance = (Ideal Cycle Time x Total Count) / Operating Time
    (ISO 22400-2), using each station's own nominalCycleSeconds (a per-row
    CSV column, not a single global constant) and its visit count.

    Quality (ISO 22400-2's third OEE factor) is deliberately NOT computed
    here - there is no defect/scrap signal anywhere in this engine (defect
    correlation was never implemented; 'defect_count' in stations.ts is an
    unrealized signal label, not a simulated value). oeeAvailabilityTimesPerformance
    is exactly that product, stated as such, never called plain "OEE"
    without the caveat travelling with it."""
    df = meta.copy()
    df["_true"] = y_true
    rows = []
    for (sid, seed), group in df.groupby(["stationId", "shiftSeed"]):
        n = len(group)
        operating_seconds = float((group["exitTick"] - group["entryTick"]).sum())
        nominal = float(group["nominalCycleSeconds"].iloc[0])
        threshold = nominal * ALERT_MULTIPLIER
        bottleneck_rate = float((group["_true"] > threshold).mean())
        availability = operating_seconds / shift_seconds if shift_seconds > 0 else None
        performance = (nominal * n) / operating_seconds if operating_seconds > 0 else None
        oee_ap = availability * performance if (availability is not None and performance is not None) else None
        rows.append({
            "stationId": str(sid),
            "shiftSeed": int(seed),
            "tier": str(group["tier"].iloc[0]),
            "n": int(n),
            "bottleneckRate": bottleneck_rate,
            "operatingSeconds": operating_seconds,
            "availability": availability,
            "performance": performance,
            "oeeAvailabilityTimesPerformance": oee_ap,
        })
    rows.sort(key=lambda r: (r["stationId"], r["shiftSeed"]))
    return rows


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

    # The ONE alert computation, shared with the live UI — see
    # src/engine/inference/alertSignal.ts and model.py's compute_alert_column.
    print("Computing the unified alert column (src/engine/ml/computeAlertColumn.ts)...")
    val_alert_df = sensor.compute_alert_column(VALIDATE_CSV, VALIDATE_ALERT_CSV)
    meta_val = sensor.merge_alert_column(meta_val, val_alert_df)
    evidence_alert_df = sensor.compute_alert_column(EVIDENCE_CSV, EVIDENCE_ALERT_CSV)
    _, evidence_y, evidence_meta = sensor.load_features(EVIDENCE_CSV)
    evidence_meta["trueCycleSeconds"] = evidence_y
    evidence_meta = sensor.merge_alert_column(evidence_meta, evidence_alert_df)

    baselines = compute_baselines(meta_val, y_val, val_pred)
    regimes = compute_regime_decomposition(meta_train, y_train, train_pred, meta_val, y_val, val_pred)
    alert_bands = compute_alert_metrics_by_band(meta_val)
    background = compute_background_starvation_rate()
    lead_time = compute_s6_s9_lead_time(evidence_meta, background.get("backgroundStarvationRate"))
    s6_tracking = compute_s6_tracking(artifact)
    diagnostic_easy = diagnose_worst_runs(evidence_meta, "easy")
    diagnostic_marginal = diagnose_worst_runs(evidence_meta, "marginal")

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

    # Per-STATION confidence (perTier above pools all 6 blind / 4 partial
    # stations together) — added specifically so a station-specific
    # instrumentation-lift figure (e.g. "S6, if promoted from blind to
    # partial") can be derived from a real empirical number for THAT
    # station, not a pooled tier average standing in for it.
    per_station_breakdown = {}
    for sid, idx in meta_val.groupby("stationId").groups.items():
        idx = np.array(idx)
        per_station_breakdown[str(sid)] = {
            "tier": str(meta_val.loc[idx[0], "tier"]),
            "n": int(len(idx)),
            "maeSeconds": float(mean_absolute_error(y_val[idx], val_pred[idx])),
            "meanConfidence": float(np.mean(val_confidence[idx])),
            "medianConfidence": float(np.median(val_confidence[idx])),
        }

    # Confidence ceilings by tier: blind/partial from the trained artifact
    # itself (ml/model.py's CONFIDENCE_CEILING, baked in at train time, per
    # docs/assumptions.md's "Observability tiers" table); sensored from
    # src/engine/assumptions.ts's SENSORED_CONFIDENCE_CEILING (the same
    # table's 0.99) — sensored stations never run through the soft sensor,
    # so this number has no artifact-baked home and is read via the same
    # TS-constants bridge as alertMultiplier etc. rather than a second,
    # hardcoded copy here.
    confidence_ceilings = {
        "blind": artifact["confidenceCeiling"],
        "partial": artifact["confidenceCeiling"],
        "sensored": sensor.ml_constants()["sensoredConfidenceCeiling"],
    }

    # Plant-manager weekly-horizon view: recurring bottleneck rate +
    # Availability/Performance per (station, shift), ground truth only.
    station_shift_operations = compute_station_shift_operations(
        meta_val, y_val, sensor.ml_constants()["shiftSeconds"]
    )

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
        "perStation": per_station_breakdown,
        "confidenceCeilings": confidence_ceilings,
        "stationShiftOperations": station_shift_operations,
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

    print(f"\nUnified alert: ALERT_MULTIPLIER={alert_bands['alertMultiplier']}  ALERT_MIN_HOLD={alert_bands['alertMinHold']}  "
          "(src/engine/inference/alertSignal.ts — same signal the live UI's Degrading tile commits on)")

    for name, title in [
        ("deliverable", "S6 -> S9 starvation lead time, DELIVERABLE (unified alert, availableTick, causal pairing)"),
        ("physicalHeadroom", "S6 -> S9 starvation lead time, PHYSICAL HEADROOM (undebounced, entryTick, causal pairing) - NOT achievable live"),
    ]:
        print(f"\n=== {title} ===")
        bundle = lead_time[name]
        for band in ["easy", "marginal"]:
            b = bundle["byBand"][band]
            lt = b["leadTimeConditionedOnCausalWarning"]
            print(f"  {band}: total runs={b['totalIncidentRuns']}  "
                  f"causalStarvation+alert={b['runsWithCausalStarvationAndAlert']}  "
                  f"alertFiredNoCausalStarvation={b['runsAlertFiredNoCausalStarvation']}  "
                  f"alertNeverFired={b['runsAlertNeverFired']}  "
                  f"onlyNonCausalStarvationExcluded={b['runsOnlyNonCausalStarvationExcluded']}  "
                  f"fireRate={b['warningFireRate']}")
            print(f"    lead time | causal warning: n={lt['n']} median={lt['medianSeconds']}  "
                  f"[{lt['minSeconds']}, {lt['maxSeconds']}]")
            we = bundle.get("workedExampleByBand", {}).get(band)
            if we:
                print(f"    worked example (shift {we['shiftSeed']}): onset={we['incidentAtTick']:.0f} "
                      f"alert fired at {we['alertTickBasis']}={we['alertTick']:.0f} (predicted "
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

    print("\n=== Per-station confidence (for instrumentation-lift figures) ===")
    for sid in sorted(per_station_breakdown):
        v = per_station_breakdown[sid]
        print(f"  {sid} ({v['tier']}): n={v['n']} meanConfidence={v['meanConfidence']:.3f} medianConfidence={v['medianConfidence']:.3f}")

    print(f"\nConfidence ceilings: blind={confidence_ceilings['blind']:.2f} "
          f"partial={confidence_ceilings['partial']:.2f} sensored={confidence_ceilings['sensored']:.2f}")
    s6 = per_station_breakdown.get("S6")
    if s6:
        lift_to_partial_ceiling = confidence_ceilings["partial"] - s6["meanConfidence"]
        lift_to_sensored_ceiling = confidence_ceilings["sensored"] - s6["meanConfidence"]
        print(f"S6 instrumentation lift: current meanConfidence={s6['meanConfidence']:.3f} "
              f"-> partial/blind ceiling {confidence_ceilings['partial']:.2f} "
              f"(+{lift_to_partial_ceiling:.3f}) -> sensored ceiling {confidence_ceilings['sensored']:.2f} "
              f"(+{lift_to_sensored_ceiling:.3f})")

    print(f"\n=== Station x shift operations ({len(station_shift_operations)} rows, "
          f"{len(set(r['stationId'] for r in station_shift_operations))} stations x "
          f"{len(set(r['shiftSeed'] for r in station_shift_operations))} shifts) ===")
    by_station: dict[str, list[float]] = {}
    for r in station_shift_operations:
        by_station.setdefault(r["stationId"], []).append(r["bottleneckRate"])
    for sid in sorted(by_station):
        rates = by_station[sid]
        print(f"  {sid}: meanBottleneckRate={np.mean(rates):.3f} "
              f"minRate={np.min(rates):.3f} maxRate={np.max(rates):.3f} (n={len(rates)} shifts)")


if __name__ == "__main__":
    main()
