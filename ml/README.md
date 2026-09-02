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

## Six disjoint data splits — what each is for and why it can't double up

`ml/generate.py` produces six CSVs, each from its own seed range, with an
overlap check that raises if any two ranges intersect:

| Split | Seeds | Used for |
|---|---|---|
| `train.csv` | 1..60 | fits the three GradientBoostingRegressor models |
| `calibrate.csv` | 50,000..50,019 | fits the isotonic confidence-calibration map — **must** be disjoint from train (else calibration measures the model's fit to its own training data) and from validate (else "validation" would be measuring the calibration map's own fit) |
| `validate.csv` | 100,000..100,014 | the untouched split every reported metric (baselines, skill, R², regime decomposition, per-band alert metrics, reliability diagram) is computed from |
| `evidence.csv` | 900,000..900,299 (300 shifts) | S6-forced every shift, random marginal/easy severity — the only source for the S9-starvation lead-time metric, since that metric is only meaningful for incidents inside the trim segment feeding the trim-to-chassis buffer |
| `tracking.csv` | 950,000..950,149 (150 shifts) | S6-forced every shift, FIXED at the canonical degraded cycle (not a random severity) — measures whether predictions converge to the true value across successive visits after onset, without averaging across a mix of severities |
| `baseline.csv` | 990,000..990,199 (200 shifts) | `incidentRate=0`, no incident ever, anywhere — establishes the background/spontaneous S9-starvation rate (0/200 in this run), so an incident-set starvation can be judged causal vs. coincidental |

A three-way split (train/calibrate/validate) is the standard reason for a
calibration split existing at all: fitting the calibration map on the same
data used to fit the point/quantile models would let it absorb training-set
overfitting instead of measuring real generalization.

## Verifying a data-pipeline bug's blast radius

An import-time side effect (a stray top-level `main()` call in
`src/engine/ml/exportTrainingRows.ts`, since fixed with a proper
`pathToFileURL`-based main-module guard) once silently re-ran the
exporter with its own default CLI args whenever another script imported
`incidentsForShift` from it. The defaults hardcode `--out ml/data/train.csv`
(see `parseArgs` in that file), so the *only* file that default invocation
could ever have overwritten is `train.csv` — confirmed structurally (the
default `out` has no code path to any other filename) and empirically, by
regenerating **every** split from its documented seed range and comparing
row count + SHA-256 against the on-disk file the current `metrics.json`
was computed from:

| Split | Result |
|---|---|
| `train.csv` | byte-identical (this session's fixed regeneration) |
| `evidence.csv` | byte-identical |
| `baseline.csv` | byte-identical |
| `calibrate.csv` | **differed** — stale, unrelated to the bug |
| `validate.csv` | **differed** — stale, unrelated to the bug |
| `tracking.csv` | **differed** — stale, unrelated to the bug |

The three differing splits were not touched by the corruption bug — they
differed because they predated the settle-period fix (see "The
warmup-transient bug" below) and were never regenerated afterward, while
`evidence.csv` and `train.csv` had been. `baseline.csv` is unaffected by
that fix by construction (`incidentRate=0` means the settle floor on
incident-injection tick never matters), which is itself a useful sanity
check that the diff tool was comparing the right thing. All three stale
splits were regenerated and `ml/validate.py` was re-run; every number in
this file reflects that final, fully-current-on-every-split run. (`calibrate.csv`
is only ever read by `ml/train.py` to fit the isotonic map baked into
`soft_sensor.json` — `ml/validate.py` never reads it directly — so its
staleness had no effect on any number reported here; it was still
regenerated for the next time someone runs `ml/train.py`. `soft_sensor.json`
itself was not touched at any point in this exercise.)

**Follow-up correction**: the paragraph above says `soft_sensor.json` was
never touched — true for the verification exercise itself, but it left a
real provenance gap: the committed artifact's isotonic calibration map was
still fit on the *stale, pre-settle-fix* `calibrate.csv`, even after every
other split and every reported metric had moved to post-fix data. A
clean checkout running `ml/generate.py` → `ml/train.py` on that state
would not have reproduced the committed artifact. This has since been
closed — see "Retraining after the stale-split fix" below.

## Retraining after the stale-split fix

`ml/train.py` was re-run once all six splits verified against the
post-settle-fix code (`train.csv` and `calibrate.csv` are its only
inputs), so both the base model and the isotonic calibration map are now
fit on current data. All three export parity self-checks
(point/q10/q90 trees and the isotonic map) passed at exactly `0.00e+00`
max diff, same as every prior run.

**Byte-reproducibility, checked, not assumed**: ran `ml/train.py` twice
in a row from the same on-disk `train.csv`/`calibrate.csv` with no code
changes between runs. The two `soft_sensor.json` outputs are
**byte-identical** (`sha256`: `dc34a18c5241da6774955326cfeee31538e416b895173bcb48d5c2d1164bbf6f`
both times). This is expected, not lucky: `GradientBoostingRegressor` is
fit with a fixed `random_state=1` for all three models (point, q10, q90),
`IsotonicRegression` has no internal randomness, and the JSON export walks
each fitted tree's arrays and Python's dict/list ordering deterministically
— there is no source of run-to-run nondeterminism anywhere in this
pipeline as currently written. A clean checkout that regenerates
`train.csv`/`calibrate.csv` from the committed seeds and re-runs
`ml/train.py` will reproduce the committed `soft_sensor.json` exactly.

`ml/validate.py` was then re-run against the freshly-fit artifact and
(now-verified-fresh) `validate.csv`, including a freshly-rendered
`calibration.png` using the freshly-fit calibration map rather than the
stale one. The numbers moved only slightly from the last report (R² 0.866
→ 0.867, nominal-baseline skill unchanged at 0.304, easy/marginal-band
lead times unchanged since they depend only on `evidence.csv`, which
hadn't changed) — consistent with this being provenance hygiene (matching
the model's calibration fit to the data it's now scored against), not a
retune. The one double-digit move, per-station skill/R² at P8 (R² 0.08 →
0.17) is a real, visible change, but within the range already flagged
above as "genuine, unexplained station-level weakness" on a thin,
incident-coverage-limited slice — not a new finding, and not the kind of
across-the-board shift a bad refit would produce.

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
up (0.292 → 0.304 overall), the opposite of the "inflation" direction one
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
this way, though — P8 (688 incident rows) and S6 (71 rows) have real
coverage and still show modest R² (0.17, 0.19); that is a genuine,
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
number: from `evidence.csv` (S6-forced every shift, 300 shifts). For each
shift with an incident: find the first S6 visit where the model's alert is
a true positive, and pair it with the first S9 starvation **causally
attributable to that incident** — at or after the exact injection tick
(`incidentAtTick`), within `2x` this run's own analytically expected drain
time (`expected_drain_seconds`, `docs/assumptions.md`'s own derivation
generalised to any degraded cycle — not a single fixed horizon, since
marginal severities drain far slower than the canonical 415s case and a
fixed cutoff would wrongly exclude their genuine starvations).

**This replaced a version that only ever recorded the single first-ever
starvation per shift** (the simulation's own `'starved'` event fires once,
guarded by an "already reported" check — see `src/engine/ml/visits.ts`'s
sibling logic in `exportTrainingRows.ts`), which could in principle pair a
run's real incident to an earlier, unrelated starvation. Before rewriting
the pairing, this was diagnosed directly rather than assumed: for the 10
most-negative runs across both bands (`diagnose_worst_runs`, printed by
`validate.py`), every single paired starvation was confirmed to occur
*after* its incident's exact injection tick, and `baseline.csv` (200
shifts, `incidentRate=0`) showed **zero** spontaneous starvations — so
there was no mispairing to fix. The rewrite (exact onset, per-run causal
horizon, every starvation tick considered via
`s9StarvationTicksAll`) is applied anyway because it's the structurally
correct way to compute this and is what makes the "not mispaired" finding
checkable rather than asserted — and it does correctly reclassify 6
marginal-band runs from "counted as fired" to "fired, no starvation within
the causal horizon."

**The negative lead times are real, and now decomposed into two distinct,
honest phenomena** — `detectionLagFromOnsetSeconds` (alert tick - onset)
and `drainTimeFromOnsetSeconds` (starvation tick - onset), so
`leadTimeSeconds = drainTime - detectionLag` is visible as a difference of
two independently-meaningful numbers, not one opaque figure.

### The warmup-transient bug (found, diagnosed, and fixed)

Before the fix below, the easy band's worst cases were negative
(worst -1,026s), and the explanation offered for them was "a
detection-latency floor: S6 is the line's 26th of 42 stations, so no
vehicle can reach it before ~tick 1,350." That explanation was internally
contradictory — several of those same runs showed **S9** (downstream of
S6) starving as early as tick 411, which is physically impossible if S9
had never been fed a vehicle. Resolved with data, not narrative, via
`src/engine/ml/diagnoseStarvationTiming.ts`, a one-off diagnostic that
reconstructs the exact incident and ground-truth stream for named seeds
(reusing `incidentsForShift` directly, so there is no second,
drifting reimplementation) and prints per-tick occupancy and buffer level
at both the onset and starvation ticks.

**The simulation's initial condition, stated plainly: it is inconsistent
between its two subsystems.** The discrete station/vehicle chain starts
**empty** at tick 0 and fills up one admission per takt (54s) — the first
vehicle does not physically reach S6 (station 26 of 42) until roughly tick
1,350-1,400. The named buffers (Painted Body Store, trim-to-chassis —
the S8→S9 buffer) do **not** follow that rule: `simulation.ts` initializes
`bufferLevels` to each buffer's `nominalFill` (its steady-state value)
from tick 0 — `bufferLevels = new Map(NAMED_BUFFERS.map((b) => [b.id,
b.nominalFill]))`. So for the first ~1,350 ticks of every shift, the
buffer's rate-based math is running against a *pre-filled* steady-state
number while the discrete chain feeding it is still physically empty.

Diagnosing the pre-fix worst-case easy-band seeds
(900275, 900219, 900253, 900015, 900227) against this directly answered
every question needed to settle it: at both the onset tick and the
starvation tick, `S6.occupied=false` and `S9.occupied=false` for all five;
`S9 ever occupied before starvation` was `false` for all five; the buffer
level was ~2.5 (nominal) at onset, draining by simulated rate math alone
to exactly 0.000 at the starvation tick, with no vehicle ever having
reached either station in between. **These were warmup transients, not
incident consequences** — an incident injected early enough could
mathematically drain a buffer that was never really "full" of anything,
before the part of the line that's supposed to keep it fed had even
started running.

**Fix**: incidents are no longer eligible to be injected before the line
has plausibly reached steady state. `SETTLE_TICKS = (S9's station index +
1) * TAKT_SECONDS` = `(28 + 1) * 54` = **1,566 ticks** — the tick by which
the first vehicle has cleared S9 and the trim-to-chassis buffer's
rate-based math is operating on a genuinely fed line, not a mathematical
fiction. `atTick` for every incident is now drawn from
`[SETTLE_TICKS, SHIFT_SECONDS - 3600)` instead of `[0, SHIFT_SECONDS -
3600)`; the pre-existing RNG draw order for severity and station targeting
was preserved exactly so this is the only thing that changed about which
incidents get generated. Re-running the same diagnostic against the
post-fix worst-case seeds confirms the fix: all five now show
`S6.occupied=true` and `S9.occupied=true` already at onset (buffer level
~2.6, i.e. nominal), and `S9 ever occupied before starvation=true` for
every one — these are now provably genuine, causal, incident-induced
starvations of a station that was actually running.

**Effect on lead time, per the instruction to report whichever outcome
the data supports (this paragraph describes what `metrics.json` now calls
`physicalHeadroom` — see "Deliverable vs. physical headroom" below for why
that name changed and what replaced it as the headline number):**
- **Easy band: fully resolved, and it was in fact a warmup transient.**
  Every one of the 164 evidence-set easy-band runs now fires a causal
  alert (fire rate 1.0) with a **positive** lead time — n=164,
  median 476s, range **[256s, 1,119s]**. The pre-fix negative worst case
  is gone because its cause (a buffer draining before the line was
  populated) no longer exists.
- **Marginal band: not a transient — a real, surviving near-threshold
  detection weakness, reported as such rather than fixed away.** 111 of
  136 runs fire a causal alert (19 never fire; 6 fire with no causal
  starvation inside the horizon); of those 111, lead time ranges from
  +2,320s down to **-16,238s** (median 1,279s) — slightly *more* extreme
  than the pre-fix worst case (-15,110s), which is expected once warmup
  artifacts stop diluting the true near-threshold cases and confirms this
  negative tail isn't a settle-period artifact in disguise. The worked
  worst case still shows a physically ordinary drain time
  (`drainTimeFromOnsetSeconds`) against a very long
  `detectionLagFromOnsetSeconds` — predictions sitting right at the alert
  threshold can take a long time to cross it convincingly. This persists
  after both correct causal pairing and the settle-period fix, and is
  reported exactly as instructed: left in, stated as the limit, not
  filtered away.

Split by severity band, each with one fully worked example. `metrics.json`
also carries `backgroundStarvationRate` (0/200 in this run) and, per band,
`runsWithCausalStarvationAndAlert` / `runsAlertFiredNoCausalStarvation` /
`runsAlertNeverFired` / `runsOnlyNonCausalStarvationExcluded` — four
mutually exclusive outcomes instead of one fire/no-fire split, so "no
qualifying starvation" is never silently folded into "never fired" or
counted as a negative lead time against a default tick.

### Deliverable vs. physical headroom — reconciling the evidence with the live UI

The 476s/1,279s medians above are real, but they were computed a way a
live, no-look-ahead system cannot reproduce: `predictedCycleSeconds >
threshold`, checked at `entryTick`, with no debounce. Two problems with
using that as a product claim, both found by directly comparing this
pipeline's output against the running browser app rather than assuming
they agreed:

1. **A prediction isn't available at entryTick.** It needs the downstream
   neighbour's dwell (`downstreamDwellSeconds`/`downstreamTransitSeconds`
   are model features), so a live system cannot compute it until that
   downstream visit has itself completed. Measured directly:
   `availableTick` (exitTick + downstreamTransitSeconds +
   downstreamDwellSeconds) lags entryTick by **104-216s** (median ~110s)
   across validate.csv's rows.
2. **A single-visit threshold crossing is not what the live UI shows.**
   The browser's Degrading tile used to gate on confidence-hysteresis
   (fixed earlier this session — see the app-side changelog), and even
   after that fix, showing Degrading on one noisy crossing would flicker.
   `src/engine/inference/alertSignal.ts`'s `resolveAlertSequence` +
   `ALERT_MIN_HOLD=2` debounces it — the exact same function the live UI's
   `classifyStation` calls.

Both are now computed in exactly ONE place — `src/engine/ml/computeAlertColumn.ts`,
a TypeScript CLI `ml/validate.py` invokes via subprocess (the same pattern
`printMlConstants.ts` already used to bridge a constant into Python; see
`model.py`'s `compute_alert_column`/`merge_alert_column`). Python never
recomputes `predicted > threshold` itself for these metrics anymore — it
reads the `alertActive`/`availableTick` columns this script produces and
aggregates on top of them. This is what makes the live UI and this
evidence pipeline structurally unable to disagree about what counts as an
alert: there is exactly one implementation, imported by both.

`compute_s6_s9_lead_time` now returns two sibling results instead of one:

- **`deliverable`** — alert tick = `availableTick`, "fired" = the unified,
  debounced `alertActive`. This is what the product can actually warn a
  person with, and is the number that belongs on a deck.
- **`physicalHeadroom`** — the original computation, byte-for-byte
  unchanged (confirmed: median 476s/1,279s, identical to the numbers
  above). Real and useful as an upper bound on how much physical time
  exists in the process, but never achievable live — kept as a separate,
  clearly labeled line specifically so it can't be quoted as the former.

**Measured result (same evidence.csv, same artifact, no retrain):**

| | physicalHeadroom (old) | deliverable (new) |
|---|---|---|
| Easy median | 476s | **237.5s** |
| Easy range | [256s, 1,119s] | [-2s, 927s] |
| Easy fire rate | 1.0 (164/164) | 1.0 (164/164) |
| Marginal median | 1,279s | **963s** |
| Marginal range | [-16,238s, 2,320s] | [-9,363s, 1,841s] |
| Marginal fire rate | 0.860 (111/136 causal) | **0.699 (93/136 causal)** |

The easy band's deliverable median (237.5s) is lower than a rough
back-of-envelope guess might expect, and honestly reported as such rather
than adjusted — it reflects the real ~110-260s availability lag plus the
2-visit debounce eating into a lead time that was only ever ~7-19 minutes
to begin with. The marginal band's fire rate drop (0.860 → 0.699) is the
more consequential finding: 22 more marginal-severity runs (41 vs 19 under
the old definition) now correctly show as **never producing a causal,
deliverable warning at all** — a real recall cost of debouncing +
availability lag on already-borderline incidents, not a bug to paper over.

`alertMetricsByBand`'s precision/recall/falseAlarmRate (on `validate.csv`)
were also switched from Python's own `y_pred > threshold` check to this
same unified column — easy: precision 0.790 (was computed slightly
differently as ~0.774-0.813 before this change, undebounced), recall
0.994; marginal: precision 0.870, recall 0.548, both essentially unchanged
from before since validate.csv's rows are evaluated well after each
incident's onset, where the debounce has already settled.

**S6 tracking** (`compute_s6_tracking`), from `tracking.csv` (150 shifts,
fixed at the canonical degraded cycle so results aren't averaged across a
severity mix): grouped by `visitIndexSinceIncident` (0 = the first visit
after the true cycle time changed, 1 = the next, ...) rather than by
simulation tick — the model produces one prediction per station visit, not
per second, so "per tick" is reinterpreted as "per successive visit since
onset" and stated as such. Answers "does the prediction track the true
degradation" directly: MAE at visit 0 (2.08s) is markedly worse than every
subsequent visit (~1.1-1.4s, matching the steady-state noise floor) — the
model needs roughly one visit to catch up after onset, then tracks
closely. **R² on this set's incident-only rows is negative (-0.64) and
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
4. S6→S9 lead time, after diagnosing and correctly implementing causal
   pairing, fixing a warmup-transient bug, and — most recently —
   reconciling the alert definition itself with the live UI's (see
   "Deliverable vs. physical headroom" above): the number that matters is
   now **`deliverable`**, not the `physicalHeadroom` figure this bullet
   used to report as the headline. Easy band: fires causally 100% of the
   time, median **237.5s** lead (down from physicalHeadroom's 476s — the
   difference is a real ~110-260s prediction-availability lag plus a
   2-visit debounce, not a regression). Marginal band: fires causally
   **69.9%** of the time (down from physicalHeadroom's 86.0% — 22 more
   runs now honestly show as never producing a deliverable warning at all),
   and the fired-and-causal cases range from +1,841s down to **-9,363s**
   (median 963s) — still a genuine, surviving near-threshold detection
   weakness, now measured on the definition that's actually achievable.
   `physicalHeadroom` (476s/1,279s medians) is retained in `metrics.json`
   as a separate, clearly labeled upper bound — real, but not a product
   claim.
5. S6 does track its own degradation once a visit lands during it — MAE
   drops from 2.08s (first affected visit) to ~1.1-1.4s (every visit
   after), matching the noise floor. The earlier "low R² at S6" finding
   was real but partly a thin-sample artifact (n=72); the larger,
   fixed-severity tracking set answers the tracking question directly
   rather than through R² on a small, noisy sample.

## TypeScript inference and the parity test

The app does not call Python at runtime and never will: Python trains,
TypeScript serves. `src/engine/inference/softSensor.ts`
reads `ml/artifacts/soft_sensor.json` directly (a bundled JSON import — the
~940KB artifact ships in the app bundle, no backend) and reimplements the
same math `ml/model.py` uses to score it: the three-tree-ensemble walk for
the point estimate and the [q10, q90] interval, the interval-width raw
confidence score, and the isotonic calibration map applied on top of it.
Every exported function in that file names its `ml/model.py` counterpart in
a comment, so the two can be diffed by eye.

**Why a parity test, and why it must cover confidence, not just cycle
time**: the app displays two numbers per blind/partial station — the
predicted cycle time and its confidence — and both come from this
TypeScript path, while every number in `ml/README.md` and
`ml/artifacts/metrics.json` comes from the Python path scoring the same
artifact. Two independent reimplementations of the same tree-walk and
isotonic-interpolation math *can* drift — a transcription slip, an
off-by-one in the tree traversal, a `<=` vs `<` — and if only cycle time
were checked, a bug isolated to the confidence path (e.g. in
`applyIsotonic`) would ship undetected: the demo would show a confidence
number the trust ledger's own metrics file doesn't back up, which is
exactly the credibility failure this project's confidence-first design
exists to prevent.

`ml/export_parity_fixture.py` freezes the reference: a fixed, deterministic
set of *real* feature vectors, pulled from `validate.csv` (one row per
target station, plus a `downstreamStarved=1` case and a
`trueIncidentActive=1` case), together with Python's own predicted cycle
time, interval, raw confidence, and calibrated confidence for each —
written to the **committed** `ml/artifacts/parity_fixture.json` (unlike
`ml/data/*.csv`, which is gitignored). `src/engine/inference/__tests__/parity.test.ts`
recomputes the same five values in TypeScript for each fixture case and
asserts all five agree with Python to within 1e-6 — cycle time and
calibrated confidence are the two the app actually renders; interval
bounds and raw confidence are checked too since a divergence there would
still be a real bug even though the app doesn't show them directly. The
test reads only the two committed JSON files; it needs neither Python nor
`ml/data/validate.csv` to run, so it runs the same way locally and in CI.

Re-run `ml/export_parity_fixture.py` whenever `soft_sensor.json` is
retrained (its cases are frozen predictions *for that specific artifact* —
retraining and not refreshing the fixture would make the test compare the
new artifact against a stale one's expected outputs) or if the feature
schema changes. It is not part of the normal `generate.py` → `train.py` →
`validate.py` loop.

Wired into `npm test` (`vitest.config.ts`'s `include` already covers
`src/engine/**/*.test.ts`, so no extra config was needed) and into
`.github/workflows/ci.yml`, which runs lint, typecheck, and the full test
suite — including this one — on every push and pull request against
`main`. The workflow has no Python step: it only needs the two committed
JSON files under `ml/artifacts/`.
