# Stratify

Stratify is a live digital twin of a 42-station car final-assembly line that
keeps producing a state estimate and a confidence score for every station,
including the ones the plant has little or no sensor data for. It infers
those estimates from signals that already exist in a plant's MES and line
control systems, so it needs no new hardware. The line is simulated, not
real plant data, and neither this README nor the product claims validation
against a real plant: every number below is computed on held-out simulated
data by a stated method, never asserted.

## The problem, and the objection it has to survive

Mainstream digital twins assume full sensor coverage. Real plants don't have
it: a majority of stations are well instrumented, but final assembly, which
is manual-heavy and mostly built decades before "digital twin" was a phrase
anyone used on that floor, carries a meaningful minority of stations with
little or no sensor data. Most twins go blind exactly where the production
losses are hardest to see.

**The objection an earlier version of this project didn't survive**: a blind
station is detectable because parts pile up before it and run dry after it.
That is wrong for automotive final assembly. Stations there sit on a
continuously moving conveyor with almost no work in progress between them,
0 to 1 unit at most stations (`docs/assumptions.md`, "Buffers and work in
progress"). There is no queue to watch. Anyone with automotive floor
experience raises this within the first minute, and they are right to.

**Our answer**: infer from three signal classes instead, all of which
already exist in a real plant's MES and line-control systems today.

| Class | What it is | New hardware |
|---|---|---|
| Timing | Station entry/exit timestamps per vehicle, from VIN barcode and carrier RFID scans | None |
| Event | Andon pulls, line stops, cycle-stop reason codes (also free labelled ground truth for training) | None |
| Occupancy | Buffer/queue depth, only where a buffer genuinely exists (the Painted Body Store, the trim-to-chassis decoupling buffer) | None |

One line: a blind station's state is written in the timing of the parts
that pass through it. Which of the three classes a station exposes is its
observability tier, sensored, partial, or blind, and the tier caps the
maximum confidence achievable there. That is a typed concept in the engine
(`ObservabilityTier` in `src/engine/types.ts`), not a copy-editing choice in
the UI. Two adjacent blind stations are a special case the tier system
refuses rather than guesses at: their combined dwell time is a single sum,
the split between them is unidentifiable from timing alone, and the twin
abstains and says so.

## Implementation approach

- **Test-first for anything a judge will see a number from.** Every function
  in `src/engine` that produces a displayed value has a failing test written
  before the implementation, 21 test files, 159 tests, all in the app's own
  suite (`npm test`), none requiring Python or a browser.
- **One source of truth for every number.** `docs/assumptions.md` is
  authoritative; the engine and the ML pipeline read from it (via
  `src/engine/assumptions.ts` and `src/engine/stations.ts`), never invent a
  parallel copy, and stop and ask when a number the work needs is not in
  that file rather than guessing one (the 4-windows-per-year maintenance
  cadence used in the Investment Case view is recorded there as exactly
  that, a stated assumption, not a derivation).
- **Python trains, TypeScript serves, and the two are proven to agree.**
  `ml/train.py` fits the soft-sensor models and exports `soft_sensor.json`.
  `src/engine/inference/softSensor.ts` reimplements the identical prediction
  math in TypeScript for the live app, which never calls Python at runtime.
  A parity test (`src/engine/inference/__tests__/parity.test.ts`) checks
  both implementations agree to within `1e-6` on frozen real feature
  vectors, the one thing standing between "the demo shows a number" and
  "the demo shows the number the metrics file backs up."
- **Confidence and abstention are not cosmetic.** An inferred value is never
  rendered without its confidence, and below the 0.60 confidence floor (or
  where two blind stations are unidentifiable) the twin refuses to estimate
  and states why, rather than showing a plausible-looking guess.
- **Diagnose before fixing.** When the S6 to S9 lead-time evidence showed
  impossible negative values, the fix wasn't tuned until the numbers looked
  right. A dedicated diagnostic script
  (`src/engine/ml/diagnoseStarvationTiming.ts`) reconstructed the exact
  ground-truth stream for the worst-case seeds first, found a real
  simulation warmup-transient bug, and the fix followed from that
  (`ml/README.md` has the full account, including the case that survived
  the fix: marginal-band detection lag is real, not an artifact, and is
  reported as a limitation below rather than hidden).
- **Read-only by construction, not by policy.** There is no actuator
  client, no MES-write call, no code path anywhere in this repository that
  changes anything on a real or simulated line. Recommendations are text.

## Solution architecture

```
src/engine/      Pure TypeScript: line simulation, signal layer, inference.
                 Forbidden from importing React or any UI module, enforced
                 by an ESLint rule, so it is independently readable,
                 testable, and runnable with zero UI or browser involved.
  stations.ts, topology.ts, simulation.ts   the 42-station line and buffers
  signals/         groundTruth.ts (full simulated state) vs. observable.ts
                   (tier-gated: a blind station's observable stream
                   literally cannot contain a value the tier forbids)
  inference/       soft-sensor reimplementation, confidence hysteresis, the
                   unified alert/debounce signal the live UI and the
                   offline evidence pipeline both call, one implementation,
                   not two
  ml/              exporters that turn simulated shifts into flat CSVs for
                   Python; feature engineering that needs topology
                   knowledge stays here so Python never re-implements
                   the line
**Models:** The soft sensor is three GradientBoostingRegressor models 
(200 estimators, depth 3, learning rate 0.1, seed 1): one squared-error model 
for the point estimate, and two quantile models at alpha 0.1 and 0.9 
that produce a prediction interval. Interval width is the raw confidence signal,
which an IsotonicRegression then calibrates against observed correctness 
on a held-out calibration split. All four are exported to ml/artifacts/soft_sensor.json 
and evaluated in TypeScript at runtime, with a parity test asserting both paths agree to 1e-6.

ml/              Python: training and validation only, never called by the
                 deployed app.
  generate.py      shells out to the TS exporter above (no re-simulated
                   line, no second implementation of the topology)
  train.py         fits 3 GradientBoostingRegressor models plus isotonic
                   confidence calibration, exports soft_sensor.json
  validate.py      scores everything on a disjoint held-out split
  artifacts/       committed JSON: soft_sensor.json, metrics.json,
                   parity_fixture.json, calibration.png. This is what makes
                   every number in this README reproducible by a judge who
                   never runs Python at all: the app reads these files
                   directly, at build time, as bundled JSON.

src/             React and TypeScript UI, five read-only views under one
                 top nav, no backend, no database, no auth:
  Floor            the floor-supervisor view: live 42-station state,
                   4-state vocabulary (Measured / Inferred / Degrading /
                   Abstained), a Plant/Stratify coverage toggle that shows
                   exactly what the plant's existing systems see versus
                   what the twin fills in
  Pipeline         how the mechanism itself works, reading the same live
                   engine snapshot Floor does
  Trust            the model's own scored track record: calibration curve,
                   precision/recall/lead-time, false-alarm rate, per-tier
                   error, the trust ledger
  Plant Manager    weekly-horizon report: coverage map, recurring-
                   bottleneck heatmap, shift variation, Availability x
                   Performance
  Investment Case  ranked sensor-addition business case, three fixed
                   budget levels, a rollout path gated by the real
                   maintenance-window cadence
  components/      Trust, Plant Manager, and Investment Case share a hero,
                   nav, and chart system (ViewHero.tsx, TopNav.tsx,
                   charts/chartKit.tsx) so typography, colour, and motion
                   read as one product rather than four independently
                   styled pages. trustMetrics.ts / opsMetrics.ts /
                   investmentMetrics.ts are the only code that reads
                   ml/artifacts/metrics.json; every number those three
                   views show traces to that file or to
                   src/engine/stations.ts's topology. Nothing is
                   hand-entered.
```

**Why the engine and ML split matters for verifiability, specifically:**

1. `src/engine`'s 159 tests run with no Python, no browser, and no
   `ml/data/*.csv` (gitignored, never committed). A judge can clone the
   repo and verify the line-simulation and inference logic in complete
   isolation from the ML pipeline.
2. `ml/artifacts/*.json` is committed, not regenerated at demo time. The
   numbers the Trust, Plant Manager, and Investment Case views show are the
   exact output of one specific, reproducible `ml/validate.py` run against
   a named held-out split. They cannot silently drift from what is
   reported, because nothing recomputes them live.
3. The parity test is the piece that actually closes the loop. Without it,
   "the model shows 60 percent confidence" (rendered live, in TypeScript)
   and "the model achieves 0.87 R-squared" (reported in `metrics.json`,
   from Python) could quietly describe two different implementations that
   happen to share a name. With it, they are proven to be the same math to
   six decimal places.

## Dependencies

**App runtime**, three packages, nothing else:

| Package | Why |
|---|---|
| `react`, `react-dom` | the UI |
| `motion` | the animation system: staggered reveals, count-up numbers, the shared active-tab and view transitions |

No backend, no database, no auth. A backend is a thing that can break on
demo day, and judges do not log in.

**Build and dev tooling**: `vite`, `typescript`, `tailwindcss` plus
`postcss`/`autoprefixer`, `vitest`, `eslint` (plus `typescript-eslint`, the
React-hooks and React-refresh plugins), `tsx` (runs the TypeScript
line-simulation CLIs headlessly, so the ML pipeline shells out to it instead
of reimplementing the line in Python).

**ML pipeline** (training only, never imported by the deployed app), pinned
in `ml/requirements.txt`:

| Package | Version |
|---|---|
| numpy | 2.1.3 |
| pandas | 2.2.3 |
| scikit-learn | 1.5.2 |
| matplotlib | 3.9.2 |

No charting library was added for the Trust, Plant Manager, or Investment
Case views. Every chart (calibration curve, bottleneck heatmap, spend versus
confidence gain, availability bars) is hand-rolled inline SVG, per the
project rule that a new dependency needs a stated reason and cold-install
cost before it is added, and none of these needed one.

## Execution instructions

Verified end-to-end in an isolated copy of this working tree (fresh
`npm install`, no pre-existing `node_modules`), not just read off a script.

**Prerequisites**: Node 20+ (CI pins Node 20), npm. Python is only needed if
you want to regenerate `ml/artifacts/*.json` from scratch; the committed
JSON is sufficient to run, build, and grade the app as-is.

### Run the app

```bash
git clone https://github.com/Ravi-Shekhar-Sharma/stratify.git
cd stratify
npm install
npm run dev          # http://localhost:5173 (or the next free port)
```

### Verify the app (what CI runs on every push)

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run, 159 tests, 21 files, no Python needed
npm run build        # production build -> dist/
npm run preview      # serve the production build locally
```

### Reproduce `ml/artifacts/metrics.json` from scratch (optional)

Only needed if you want to re-derive the validation numbers yourself rather
than trust the committed JSON. Use Python 3.12 explicitly: on at least one
tested machine the `python` found first on `PATH` was 3.14, which has no
prebuilt wheel for the pinned `numpy==2.1.3` and fails the install. Point
the venv at a 3.12 interpreter directly (`py -3.12` on Windows, or an
explicit path) if a bare `python -m venv` fails the same way.

```bash
# from the repo root, generate.py shells out to a TS CLI, so npm install
# above must already have run
cd ml
python3.12 -m venv .venv          # or: py -3.12 -m venv .venv   (Windows)
.venv/Scripts/activate             # Windows
source .venv/bin/activate          # macOS/Linux
pip install -r requirements.txt

python generate.py    # ~6 to 8 min, writes ml/data/*.csv (gitignored, six
                       # disjoint seed ranges: train/calibrate/validate/
                       # evidence/tracking/baseline, see ml/README.md)
python train.py       # ~3 min, writes ml/artifacts/soft_sensor.json
python validate.py    # ~2 to 3 min, writes ml/artifacts/metrics.json and
                       # ml/artifacts/calibration.png
```

If `soft_sensor.json` is retrained, also refresh the frozen parity fixture
and re-check the two implementations still agree:

```bash
python export_parity_fixture.py   # from ml/, writes parity_fixture.json
cd .. && npm test                 # parity.test.ts checks TS vs Python to 1e-6
```

Full method, every intermediate finding, and the six-split reasoning are in
`ml/README.md`. This section is the short path, that file is the long one.

## Validation results

**Computed on**: `ml/validate.csv`, seeds `100000` to `100014` (15 held-out
shifts, 62,155 rows), a split the models never trained or calibrated on.
`ml/train.csv` (60 shifts, 248,589 rows) is shown only where noted, for the
overfit-gap comparison. The S6 to S9 lead-time numbers come from a separate,
dedicated evidence set (`evidence.csv`, 300 S6-forced shifts), see
`ml/README.md` for why that metric needs its own split.

**Soft-sensor accuracy** (blind and partial stations only; sensored
stations report ground truth directly and never go through this model):

| | Value |
|---|---|
| Overall MAE, held-out | 1.29s |
| Overall MAE, train | 1.25s (small overfit gap) |
| R-squared, held-out | 0.867 |
| Skill vs. nominal-cycle baseline | **0.304**, modest, not dramatic |
| Skill vs. previous-visit baseline | 0.254 |

The soft sensor beats both naive baselines, but by roughly a quarter to a
third, not by an order of magnitude. MAE alone would have hidden this.

**Per-station R-squared is uneven, and the weakest real result is P8**
(Paint Inspection and Buff, partial tier): R-squared 0.17 on 688
incident-affected rows, the largest incident sample of any target station,
so this is not a small-sample artifact. S6, the demo station, scores a
similarly low R-squared 0.19, but on only 71 incident rows, a much thinner
sample. Three other stations (S11, S14, S17) drew zero incident-affected
rows by chance in this 15-shift split, so their near-zero R-squared
(0.03 to 0.04) reflects the split, not the model. A separate, fixed-severity
tracking test (150 shifts, `ml/artifacts/metrics.json`'s `s6Tracking`) shows
S6's prediction does converge to the true degraded value after roughly one
visit (MAE 2.08s at the first affected visit, 1.1 to 1.4s every visit after,
matching the steady-state noise floor), so the low R-squared at S6 is a real
per-visit-noise finding on a thin sample, not evidence the model never
tracks it at all. P8's result has no such excuse and is reported as the
genuinely weak station.

**Calibration**: mean absolute gap between stated confidence and observed
accuracy, weighted across the four confidence buckets the model actually
produces, is 0.4 percentage points. Concretely: when the model reports
about 57 percent confidence, it is right about 57 percent of the time
(n = 47,408, the largest bucket); when it reports about 81 percent, it is
right about 80 percent of the time (n = 3,658). "Right" means the predicted
cycle time landed within 1.50s of the true value, one standard deviation of
residuals on the calibration split. Before isotonic calibration was applied,
the model said "11 percent confident" while being correct 76 percent of the
time on those rows; that is what the calibration step fixes, not a rounding
footnote.

**Bottleneck alerting** (1.15x nominal cycle, the exact debounced signal the
live UI's Degrading tile commits on):

| Band | Precision | Recall | False-alarm rate |
|---|---|---|---|
| Easy (1.3x to 2.0x nominal) | 0.790 | 0.994 | 0.23% |
| Marginal (1.10x to 1.25x nominal) | 0.870 | **0.548** | 0.23% |

Precision on even the easy band is 0.79, not 1.0, once measured against the
true, heavily imbalanced steady-state base rate. A low false-alarm rate can
still coexist with mediocre precision when positives are rare. Marginal-band
recall is 0.55: the model misses nearly half of near-threshold incidents,
by design of what "marginal" means (deliberately close to normal jitter),
but a real limit, not a rounding error.

**S6 to S9 starvation lead time**, deliverable (what a live, no-look-ahead
system can actually warn with: the debounced alert, at the tick a
prediction is actually available) versus physical headroom (the
undebounced, instant-crossing upper bound, kept separate and never quoted
as achievable):

| | Deliverable | Physical headroom |
|---|---|---|
| Easy median lead | **about 4 minutes** (237.5s) | about 8 minutes (476s) |
| Easy causal fire rate | 100% (164/164) | 100% (164/164) |
| Marginal median lead | 963s | 1,279s |
| Marginal causal fire rate | 69.9% (93/136) | 86.0% (111/136) |

The easy band fires causally every time, with a positive lead time in all
164 evidence shifts. The marginal band is the honest limit of this whole
mechanism: 30 percent of marginal-severity incidents (41 of 136) never
produce a deliverable warning inside the causal horizon at all, and among
the 93 that do fire, lead time ranges as low as minus 9,363 seconds, a
warning that arrives after the buffer has already been empty for over two
and a half hours. This is reported because it is what the debounce and
availability lag actually cost on near-threshold cases, not smoothed into
the headline number. Background false-positive rate for the whole
starvation mechanism: 0 of 200 no-incident baseline shifts produced a
spontaneous S9 starvation, so the starvations paired against real incidents
above are not coincidental.

## Limitations and what we do not claim

- **The line is simulated. We do not claim validation on real plant data,**
  anywhere, in any document this project produces. Every number above is
  computed on Stratify's own simulation.
- **We do not cite Bosch Kaggle competition accuracy figures as evidence
  this method works.** That competition's winning solutions exploited an
  ordering leak in row IDs, not physics, and citing them would be exactly
  the kind of overclaim this project exists to avoid.
- **42 stations is a line segment, not a plant.** A real automotive final
  assembly line runs roughly 200 to 500 stations; 42 was chosen to be
  demonstrable, and the scope is stated rather than implied to be a full
  plant.
- **No defect or quality model.** The two defect paths named in the demo
  incident (torque drift at S2, humidity drift at P3) are stated rules from
  `docs/assumptions.md`, not learned from data. There is no defect-injection
  model in the simulation to generate labelled training examples from, and
  no code anywhere in this engine computes a scrap or defect rate. The
  Plant Manager view's OEE figure is stated as Availability times
  Performance only, never as a full three-factor product, for exactly this
  reason.
- **No operator concept.** There is no operator identity anywhere in this
  engine. Showing "operator variation" would mean fabricating data, so the
  Plant Manager view reports shift-to-shift variation only, and says so.
- **Marginal-severity detection is a real, unresolved limit**, not a
  transient or a bug: 30 percent of near-threshold incidents produce no
  timely warning at all, and the worst observed case fires over two hours
  after the buffer emptied. Stated above, not smoothed over.
- **No payback claim.** Instrumentation cost figures and the 4-windows-per-
  year maintenance cadence are stated assumptions, not measurements or
  industry-sourced numbers. `docs/assumptions.md`'s "Pending verification"
  section marks the automotive unplanned-downtime cost and cost-of-poor-
  quality figures as unverified. Converting a confidence-point gain into a
  dollar benefit needs one of those, and since neither is verified, the
  Investment Case view withholds a payback figure entirely rather than
  convert an unverified number into one that looks precise.
- **Two adjacent blind stations are not separately identifiable from timing
  alone.** The twin abstains in this case rather than guessing, by design.


## Demo video and live URL

- [Demo video](https://drive.google.com/drive/u/2/folders/1bfHMx5jlHNaKPz15j95f2q5IcTVl9QqP)
- [Live URL](https://stratify-mu-topaz.vercel.app/)
