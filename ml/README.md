# ml — the evidence factory

Python side: data generation, soft-sensor training, calibration, and
validation. Scripts only, no notebooks — every number here is reproducible
from the command line, on a clean checkout, in three commands.

## Setup

```
python -m venv .venv
.venv/Scripts/activate      # Windows
source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

Tested against Python 3.12. Also needs the repo's Node dependencies
installed (`npm install` at the repo root) — `ml/generate.py` shells out to
a TypeScript CLI; see "Why TypeScript generates the data" below.

## Reproduce everything

```
python ml/generate.py    # ~6-8 min — writes ml/data/*.csv (gitignored)
python ml/train.py       # ~3 min   — writes ml/artifacts/soft_sensor.json
python ml/validate.py    # ~2-3 min — writes ml/artifacts/{metrics.json,calibration.png}
```

Each script fails loudly and tells you what to run first if its input is
missing.

## Five disjoint data splits — what each is for and why it can't double up

`ml/generate.py` produces five CSVs, each from its own seed range, with an
overlap check that raises if any two ranges intersect:

| Split | Seeds | Used for |
|---|---|---|
| `train.csv` | 1..60 | fits the three GradientBoostingRegressor models |
| `calibrate.csv` | 50,000..50,019 | fits the isotonic confidence-calibration map — **must** be disjoint from train (else calibration measures the model's fit to its own training data) and from validate (else "validation" would be measuring the calibration map's own fit) |
| `validate.csv` | 100,000..100,014 | the untouched split every reported metric (baselines, skill, R², regime decomposition, per-band alert metrics, reliability diagram) is computed from |
| `evidence.csv` | 900,000..900,299 (300 shifts) | S6-forced every shift, random marginal/easy severity — the only source for the S9-starvation lead-time metric, since that metric is only meaningful for incidents inside the trim segment feeding the trim-to-chassis buffer |
| `tracking.csv` | 950,000..950,149 (150 shifts) | S6-forced every shift, FIXED at the canonical degraded cycle (not a random severity) — measures whether predictions converge to the true value across successive visits after onset, without averaging across a mix of severities |

A three-way split (train/calibrate/validate) is the standard reason for a
calibration split existing at all: fitting the calibration map on the same
data used to fit the point/quantile models would let it absorb training-set
overfitting instead of measuring real generalization.

## Why TypeScript generates the data

`ml/generate.py` does not simulate anything — it shells out to
`npx tsx src/engine/ml/exportTrainingRows.ts`, which drives the same line
simulation the rest of the project uses and writes a flat, ML-ready CSV.
Feature engineering that needs topology or incident-schedule knowledge —
who is upstream of whom, where the two named buffers sit, which station an
incident targets and at what severity, when S9 first starves — happens in
TypeScript (`src/engine/ml/visits.ts`, `src/engine/ml/exportTrainingRows.ts`),
not in Python. A second implementation of the line's timing semantics in
Python would drift from the TypeScript one, and every number downstream
would be validating a model of a model rather than the model.

## Constants — single source of truth

Jitter and the alert multiplier are read from `src/engine/assumptions.ts`
(which mirrors `docs/assumptions.md`'s "## ML modelling choices" section)
via `src/engine/ml/printMlConstants.ts` — `ml/model.py`'s `ml_constants()`
calls that CLI and caches the result. Neither Python script hardcodes its
own copy of either number; if a second, independent copy existed, they
could silently drift apart. `docs/assumptions.md` marks both explicitly as
"modelling choice, not industry-sourced" rather than presenting them as if
they were derived from the line description.

None of these are picked to make a result look better; each was fixed
before the run that used it, and none was revisited after seeing a metric
it affects. Where that happened anyway in an earlier version of this
pipeline, it's documented below, not hidden.

- **Cycle-time jitter, ±5%**: an assumed input to the simulation, not
  measured. Chosen once, before any model was trained, as "a fixed
  fraction of nominal cycle" (per station, that's
  `nominalCycleSeconds * 0.05`).
- **Alert multiplier, 1.15x**: a station is "alerting" when cycle time
  exceeds nominal by 15%. The marginal severity band (1.10x-1.25x, also
  in `docs/assumptions.md` now) is deliberately centred on this threshold
  so the alert classification is a real test.
- **Calibration tolerance** (`ml/train.py`): **one standard deviation of
  residuals, computed once on the calibration split.** This replaced an
  earlier, indefensible version of this pipeline that picked a "correct
  enough" tolerance (5 seconds, then 2 seconds) specifically because a
  looser value made every confidence bucket look equally accurate (a flat,
  uninformative curve) and a tighter one produced a nicer-looking
  monotonic curve. Picking a tolerance *because* of what it does to the
  plot is exactly the failure mode being avoided here — the fix was to
  derive it from a fixed statistic of the actual error distribution
  instead, before looking at any calibration curve, and use whatever comes
  out.
- **Raw-confidence rescale range** (`ml/train.py`, p5/p95 of training
  interval widths): this is a heuristic, uncalibrated proxy — it only
  needs to preserve a sensible ordering (narrower predicted interval =
  higher raw score). It is not the reported confidence. Isotonic
  regression (below) maps it to real observed accuracy on a disjoint
  split, which is a materially stronger guarantee than tuning this range
  ever could be.

## ml/train.py — the soft sensor

**Scope, stated explicitly:** covers the 6 stations tagged `blind` (S3, S6,
S11, S14, S17, S19) and the 4 tagged `partial` (P7, P8, S8, S21) in
`docs/assumptions.md` — neither tier gets true cycle time for free, only
`sensored` does. One pooled model across all 10 target stations (station
identity and tier are features), not 10 separate models.

**No defect model.** Deliberate scope decision, not an omission. The
defect paths (S2 Cockpit torque drift, P3 Basecoat humidity drift) stay as
explicit rules with a stated confidence, taken directly from
`docs/assumptions.md`'s "## The demo incident" table — not learned from
data. Reasons: (1) no defect-injection model exists in the simulation to
generate labelled training examples from; (2) the two defect paths are
already specific, quantified claims in the assumptions file that a
from-scratch model trained on synthetic data cannot currently improve on
or validate against; (3) conflating "trained" and "rule-based" numbers in
one artifact would blur which is which.

**Feature list** (also printed by the script — this is the audited list):

```
stationIndexInLine, isPartialTier,
upstreamDwellSeconds, upstreamTransitSeconds,
downstreamDwellSeconds, downstreamTransitSeconds,
targetAndon, targetBlocked,
upstreamAndon, upstreamBlocked,
downstreamAndon, downstreamBlocked, downstreamStarved,
bufferLevelAtEntry, targetProcessValue
```

Excluded by construction: `shiftSeed`, raw `stationId`, `vehicleId`,
`entryTick` are simulation bookkeeping. Nothing derived from the target's
own `trueCycleSeconds` is included. `bufferLevelAtEntry` is in the schema
for generality but is empty for every current row — none of the 6 blind
stations sit adjacent to either named buffer in this topology.

Model: `sklearn.ensemble.GradientBoostingRegressor`, `squared_error` loss
for the point estimate, plus `loss='quantile'`, `alpha=0.1`/`0.9` for a
prediction interval (`n_estimators=200, max_depth=3, learning_rate=0.1`).
Confirmed against the pinned `scikit-learn==1.5.2` docs before writing
this. Export self-checked (not just asserted) by reconstructing
predictions from the exported JSON and comparing to `model.predict()` —
max observed difference across all three models was exactly `0.00e+00`.

## Confidence calibration (isotonic regression)

1. Compute raw confidence (the heuristic p5/p95-scaled score) on
   `calibrate.csv`.
2. `tolerance = std(predicted - true)` on `calibrate.csv`, computed once.
3. `is_correct = |error| <= tolerance` on `calibrate.csv`.
4. Fit `sklearn.isotonic.IsotonicRegression(raw_confidence -> is_correct)`
   on `calibrate.csv`. This directly maps raw confidence to observed
   accuracy rate on data the models never trained on.
5. Export `(X_thresholds_, y_thresholds_)` — sklearn's documented,
   piecewise-linear representation of the fitted map
   (https://scikit-learn.org/1.5/modules/generated/sklearn.isotonic.IsotonicRegression.html) —
   into `soft_sensor.json`. Self-checked the same way as the trees:
   reconstructed via `ml/model.py`'s `apply_isotonic` and compared to
   `IsotonicRegression.predict()` before writing — `0.00e+00` max diff.
6. `ml/validate.py` recomputes confidence on `validate.csv` (never seen by
   either the models or the calibration fit) by applying this same map.

**Before this fix**, raw confidence alone was badly miscalibrated: nearly
every validation prediction landed in the lowest confidence bucket (mean
~0.08–0.11) despite being correct the overwhelming majority of the time —
the model said 11% and was right 76%. **After isotonic calibration**, the
reliability diagram (`ml/artifacts/calibration.png`) sits almost exactly on
the diagonal across confidence 0.58–0.81 (the full range the model
actually produces on this split — it doesn't emit very low or very high
confidence here).

## ml/validate.py — what's measured and how

**Baselines and skill** (`compute_baselines`): (a) predicts each station's
own nominal cycle time **as stated in `docs/assumptions.md`, per station —
not a single global constant.** For 9 of the 10 target stations the file
states no number of its own, so they use takt (54s), which is also the
simulation's internal default for them. S6 is the one exception: the
file's "## The demo incident" table states its nominal cycle as **55s**,
which is *not* what the simulation uses internally for S6's steady state
(54s — see `src/engine/stations.ts`'s note on why: the 415s starvation
derivation never uses 55 in its own math). This baseline uses the file's
55 for S6, not the simulation's 54, because the ask was specifically "from
`docs/assumptions.md`." The naive global-54 version (what an unchecked
implementation would produce) is reported alongside in
`metrics.json`'s `nominalCycleBaseline.naiveGlobal54Comparison` for
comparison — in this run the corrected version turns out very slightly
*harder* to beat (55 is worse than 54 at predicting S6's actual
54-centred steady state), not easier, so the fix moved skill very slightly
up (0.304 → 0.314 overall), the opposite of the "inflation" direction one
might expect — an honest, checkable result of the file and the simulation
disagreeing about one number, not a mistake in either baseline
computation. (b) predicts the same station's immediately preceding visit
within the same shift (99.8% row coverage — the first visit of a station
in a shift has no defined prediction under this baseline and is excluded
from it, not silently zero-filled). Skill score is
`1 - model_MAE / baseline_MAE`, computed on the same row subset as its
baseline. R² via `sklearn.metrics.r2_score`.

**Critical caveat on per-station R²/skill**: with only 15 validation
shifts and incidents randomly assigned across 10 target stations, three
stations (S11, S14, S17) drew **zero** incident-affected rows in this
validation split by chance — their held-out `trueCycleSeconds` is pure
jitter noise with no incident-driven variance to explain, so their
near-zero R² (0.03–0.04) reflects the split's random assignment, not
necessarily worse model skill there. `metrics.json`'s
`baselines.incidentRowsByStation` and `labelStdByStation` make this
checkable directly rather than asserted. Not every low score is explained
this way, though — P8 (728 incident rows) and S6 (72 rows) have real
coverage and still show modest R² (0.08, 0.19); that is a genuine,
unexplained station-level weakness, not a coverage artifact.

**Regime decomposition** (`compute_regime_decomposition`): held-out split
into steady-state (`trueIncidentActive == 0`) and incident-tracking
(`== 1`) rows, ground-truth-labelled by the TS exporter (not re-derived
from a threshold on the noisy label in Python). Train MAE is printed
alongside held-out MAE (not split by regime) so the overfit gap is visible
on its own axis.

**Severity bands** (`compute_alert_metrics_by_band`): the TS exporter
injects "marginal" incidents at 1.10x-1.25x nominal (close enough to ±5%
jitter that separating it from noise is a real classification problem) and
"easy" incidents at 1.3x-2.0x (clearly separable), tagged per-row as
`severityBand` from the *known* injected multiplier — not re-derived from
the noisy observed ratio, because jitter makes the bands overlap right at
the boundary. Precision/recall/false-alarm-rate reported separately per
band on `validate.csv`.

**S6→S9 lead time** (`compute_s6_s9_lead_time`), the headline evidence
number: from `evidence.csv` only (S6-forced every shift, 300 shifts). For
each shift with an incident: find the first S6 visit where the model's
alert is a true positive, find S9's first starved tick (ground truth, from
the trim-to-chassis buffer emptying — see `src/engine/simulation.ts`), and
report `starvation_tick - alert_tick`. **Conditioned on a warning having
fired at all** — a run where the alert never fires is a recall failure,
already counted in the alert metrics, and is **excluded from this
distribution entirely**, never differenced against a default/fallback
tick. `metrics.json`'s `runsIncludedFired` / `runsExcludedNeverFired` /
`warningFireRate` per band make this conditioning checkable directly, not
asserted. **Not clamped to be non-negative** — a negative value means
starvation was already underway before the model caught it, and that does
happen (see the metrics for exactly how often and by how much — the
marginal band's worst case is over 4 hours late). Split by severity band,
each with one fully worked example (alert tick, predicted value,
threshold, starvation tick, difference) printed and written to
`metrics.json`. This redefinition replaced an earlier version of this
pipeline that reported "0.0s lead time" — which was actually detection
latency (time from a visit occurring to the model flagging it), not
time-to-the-event-it-predicts, and was labelled incorrectly as "lead time."

**S6 tracking** (`compute_s6_tracking`), from `tracking.csv` (150 shifts,
fixed at the canonical degraded cycle so results aren't averaged across a
severity mix): grouped by `visitIndexSinceIncident` (0 = the first visit
after the true cycle time changed, 1 = the next, ...) rather than by
simulation tick — the model produces one prediction per station visit, not
per second, so "per tick" is reinterpreted as "per successive visit since
onset" and stated as such. Answers "does the prediction track the true
degradation" directly: MAE at visit 0 (3.85s) is markedly worse than every
subsequent visit (~1.2-1.4s, matching the steady-state noise floor) — the
model needs roughly one visit to catch up after onset, then tracks
closely. **R² on this set's incident-only rows is negative (-0.79) and
that is expected, not contradictory**: `tracking.csv`'s incident rows are
all the same fixed severity by construction, so the true label's variance
within that subset is just jitter noise (std ~1.27s) — there is almost no
real signal left for any model to explain, so R² (a ratio of
explained-to-total variance) is mathematically near zero or negative
regardless of prediction quality. MAE, which stays at the noise floor, is
the right metric for this slice; R² is the right metric for a slice with
real severity variance (like `validate.csv`'s S6 rows, R²=0.19 on n=72).

## What the numbers actually say

See the session report for the full current numbers with commentary — this
README describes the method, not a frozen result, and the numbers will
move as the simulation, features, splits, or thresholds change. Headlines
worth restating here because they came from real investigation:

1. The soft sensor beats both naive baselines, but modestly (~25-31%
   skill) — MAE alone said nothing about this.
2. Per-station skill is highly uneven, and about half of that unevenness
   traces to validation-split incident coverage, not station difficulty —
   see the caveat above. The rest (P8, S6) is real and unexplained by
   coverage, though S6's own tracking test (below) tells a more complete
   story than the thin 72-row validate.csv sample alone could.
3. Alert precision on even the "easy" band is 0.78, not 1.000, once
   measured against the true (highly imbalanced) steady-state base rate —
   a low false-alarm *rate* (0.3%) can still mean mediocre precision when
   positives are rare. Marginal-band recall is 0.55 — the model misses
   nearly half of near-threshold incidents.
4. S6→S9 lead time, conditioned on a warning firing: easy band fires
   100% of the time (median +470s) but still has a negative worst case
   (-1026s). Marginal band only fires 87% of the time (18 of 136 runs
   never alert at all, a real recall failure) and among those that do
   fire, the range is enormous — median +1287s but as bad as -15,110s
   (over 4 hours late) in the worst observed case.
5. S6 does track its own degradation once a visit lands during it — MAE
   drops from 3.85s (first affected visit) to ~1.2-1.4s (every visit
   after), matching the noise floor. The earlier "low R² at S6" finding
   was real but partly a thin-sample artifact (n=72); the larger,
   fixed-severity tracking set answers the tracking question directly
   rather than through R² on a small, noisy sample.
