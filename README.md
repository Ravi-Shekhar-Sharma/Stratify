# Stratify

Stratify is a live digital twin of a 42-station car final-assembly line that
keeps producing a state estimate and a confidence score for every station,
including the ones the plant has little or no sensor data for. **The line is
simulated, not real plant data, and neither this README nor the product
claims validation against a real plant** — every number below is computed on
held-out simulated data by a stated method, never asserted. Read only: there
is no write path to line control anywhere in the codebase, and there never
will be.

## The problem, and the objection it has to survive

Mainstream digital twins assume full sensor coverage. Real plants don't have
it: a majority of stations are well instrumented, but final assembly —
manual-heavy, mostly built decades before "digital twin" was a phrase anyone
used on that floor — carries a meaningful minority of stations with little or
no sensor data. Most twins go blind exactly where the production losses are
hardest to see.

**The objection an earlier version of this project didn't survive**: a blind
station is detectable because parts pile up before it and run dry after it.
That's wrong for automotive final assembly. Stations there sit on a
continuously moving conveyor with almost no work in progress between them —
0 to 1 unit at most stations (`docs/assumptions.md`, "Buffers and work in
progress"). There is no queue to watch. Anyone with automotive floor
experience raises this within the first minute, and they're right to.

**Our answer**: infer from three signal classes instead, all of which already
exist in a real plant's MES and line-control systems today —

| Class | What it is | New hardware |
|---|---|---|
| Timing | Station entry/exit timestamps per vehicle, from VIN barcode and carrier RFID scans | None |
| Event | Andon pulls, line stops, cycle-stop reason codes (also free labelled ground truth for training) | None |
| Occupancy | Buffer/queue depth, only where a buffer genuinely exists (the Painted Body Store, the trim-to-chassis decoupling buffer) | None |

One line: **a blind station's state is written in the timing of the parts
that pass through it.** Which of the three classes a station exposes is its
*observability tier* — sensored, partial, or blind — and the tier caps the
maximum confidence achievable there. That's a typed concept in the engine
(`ObservabilityTier` in `src/engine/types.ts`), not a copy-editing choice in
the UI. Two adjacent blind stations are a special case the tier system
refuses rather than guesses at: their combined dwell time is a single sum, the
split between them is unidentifiable from timing alone, and the twin abstains
and says so.

## Implementation approach

- **Test-first for anything a judge will see a number from.** Every function
  in `src/engine` that produces a displayed value has a failing test written
  before the implementation — 20 test files, 150 tests, all in the app's own
  suite (`npm test`), none requiring Python or a browser.
- **One source of truth for every number.** `docs/assumptions.md` is
  authoritative; the engine and the ML pipeline read from it (via
  `src/engine/assumptions.ts` and `src/engine/stations.ts`), never invent a
  parallel copy, and stop-and-ask when a number the work needs isn't in that
  file rather than guessing one (the 4-windows/year maintenance cadence used
  in the Investment Case view is recorded there as exactly that: a stated
  assumption, not a derivation).
- **Python trains, TypeScript serves — and the two are proven to agree.**
  `ml/train.py` fits the soft-sensor models and exports `soft_sensor.json`.
  `src/engine/inference/softSensor.ts` reimplements the identical prediction
  math in TypeScript for the live app, which never calls Python at runtime. A
  parity test (`src/engine/inference/__tests__/parity.test.ts`) checks both
  implementations agree to within `1e-6` on frozen real feature vectors — the
  one thing standing between "the demo shows a number" and "the demo shows
  the number the metrics file backs up."
- **Confidence and abstention are not cosmetic.** An inferred value is never
  rendered without its confidence, and below the 0.60 confidence floor (or
  where two blind stations are unidentifiable) the twin refuses to estimate
  and states why, rather than showing a plausible-looking guess.
- **Diagnose before fixing.** When the S6→S9 lead-time evidence showed
  impossible negative values, the fix wasn't tuned until the numbers looked
  right — a dedicated diagnostic script (`src/engine/ml/diagnoseStarvationTiming.ts`)
  reconstructed the exact ground-truth stream for the worst-case seeds first,
  found a real simulation warmup-transient bug, and the fix followed from
  that (`ml/README.md` has the full account, including the case that
  survived the fix — marginal-band detection lag is real, not an artifact,
  and is reported as a limitation below rather than hidden).
- **Read-only by construction, not by policy.** There is no actuator client,
  no MES-write call, no code path anywhere in this repository that changes
  anything on a real or simulated line. Recommendations are text.

## Solution architecture

```
src/engine/      Pure TypeScript — line simulation, signal layer, inference.
                 Forbidden from importing React or any UI module, enforced
                 by an ESLint rule, so it is independently readable, testable,
                 and runnable with zero UI or browser involved.
  stations.ts, topology.ts, simulation.ts   the 42-station line and its buffers
  signals/         groundTruth.ts (full simulated state) vs. observable.ts
                   (tier-gated — a blind station's observable stream literally
                   cannot contain a value the tier forbids)
  inference/       soft-sensor reimplementation, confidence hysteresis, the
                   unified alert/debounce signal the live UI and the offline
                   evidence pipeline both call — one implementation, not two
  ml/              exporters that turn simulated shifts into flat CSVs for
                   Python — feature engineering that needs topology knowledge
                   stays here so Python never re-implements the line

ml/              Python — training and validation only, never called by the
                 deployed app.
  generate.py      shells out to the TS exporter above (no re-simulated line)
  train.py         fits 3 GradientBoostingRegressor models + isotonic
                   confidence calibration, exports soft_sensor.json
  validate.py      scores everything on a disjoint held-out split
  artifacts/       COMMITTED JSON — soft_sensor.json, metrics.json,
                   parity_fixture.json, calibration.png. This is what makes
                   every number in this README reproducible by a judge who
                   never runs Python at all: the app reads these files
                   directly, at build time, as bundled JSON.

src/             React + TypeScript UI, five read-only views behind one
                 toggle, no backend, no database, no auth:
  Twin             the floor-supervisor view — live 42-station state,
                   4-state vocabulary (Measured / Inferred / Degrading /
                   Abstained)
  Pipeline         flow diagram of the line
  Trust            the model's own scored track record — calibration curve,
                   precision/recall/lead-time, false-alarm rate, per-tier
                   error, the trust ledger
  Plant Manager    weekly-horizon report — coverage map, recurring-bottleneck
                   heatmap, shift variation, Availability/Performance (ISO
                   22400-2)
  Investment Case  ranked sensor-addition business case, three fixed budget
                   levels, a rollout path gated by real maintenance-window
                   cadence
  trustMetrics.ts / opsMetrics.ts / investmentMetrics.ts are the only code
  that reads ml/artifacts/metrics.json; every number the three static-report
  views show traces to that file or to src/engine/stations.ts's topology —
  nothing is hand-entered.
```

**Why the engine/ML split matters for verifiability, specifically:**

1. `src/engine`'s 150 tests run with no Python, no browser, and no
   `ml/data/*.csv` (gitignored, never committed) — a judge can clone the repo
   and verify the line-simulation and inference logic in complete isolation
   from the ML pipeline.
2. `ml/artifacts/*.json` is committed, not regenerated at demo time. The
   numbers the Trust/Plant Manager/Investment Case views show are the exact
   output of one specific, reproducible `ml/validate.py` run against a named
   held-out split — they cannot silently drift from what's reported, because
   nothing recomputes them live.
3. The parity test is the piece that actually closes the loop: without it,
   "the model shows 60% confidence" (rendered live, in TypeScript) and "the
   model achieves 0.87 R²" (reported in `metrics.json`, from Python) could
   quietly describe two different implementations that happen to share a
   name. With it, they're proven to be the same math to six decimal places.

## Dependencies

**App runtime** — two packages, nothing else:

| Package | Why |
|---|---|
| `react`, `react-dom` | the UI. No backend, no database, no auth — a backend is a thing that can break on demo day, and judges don't log in. |

**Build/dev tooling**: `vite`, `typescript`, `tailwindcss` + `postcss`/`autoprefixer`,
`vitest`, `eslint` (+ `typescript-eslint`, the React-hooks/refresh plugins),
`tsx` (runs the TypeScript line-simulation CLIs headlessly — the ML pipeline
shells out to it instead of reimplementing the line in Python).

**ML pipeline (training only — never imported by the deployed app)**, pinned
in `ml/requirements.txt`:

| Package | Version |
|---|---|
| numpy | 2.1.3 |
| pandas | 2.2.3 |
| scikit-learn | 1.5.2 |
| matplotlib | 3.9.2 |

No charting library was added for the Trust/Plant Manager/Investment Case
views — every chart (calibration curve, bottleneck heatmap, availability
bars) is hand-rolled inline SVG/CSS, per the project rule that a new
dependency needs a stated reason and cold-install cost before it's added, and
none of these needed one.

## Execution instructions

Verified end-to-end in an isolated copy of this working tree (fresh
`npm install`, no pre-existing `node_modules`), not just read off a script.

**Prerequisites**: Node 20+ (CI pins Node 20), npm. Python is only needed if
you want to regenerate `ml/artifacts/*.json` from scratch — the committed
JSON is sufficient to run, build, and grade the app as-is.

### Run the app

```bash
git clone <this-repo-url>
cd stratify
npm install
npm run dev          # http://localhost:5173 (or the next free port)
```

### Verify the app (what CI runs on every push)

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
npm test             # vitest run — 150 tests, 20 files, no Python needed
npm run build        # production build -> dist/
npm run preview      # serve the production build locally
```

### Reproduce `ml/artifacts/metrics.json` from scratch (optional)

Only needed if you want to re-derive the validation numbers yourself rather
than trust the committed JSON. **Use Python 3.12 explicitly** — on at least
one tested machine the `python` found first on `PATH` was 3.14, which has no
prebuilt wheel for the pinned `numpy==2.1.3` and fails the install; point the
venv at a 3.12 interpreter directly (`py -3.12` on Windows, or an explicit
path) if a bare `python -m venv` fails the same way.

```bash
# from the repo root — generate.py shells out to a TS CLI, so npm install
# above must already have run
cd ml
python3.12 -m venv .venv          # or: py -3.12 -m venv .venv   (Windows)
.venv/Scripts/activate             # Windows
source .venv/bin/activate          # macOS/Linux
pip install -r requirements.txt

python generate.py    # ~6-8 min — writes ml/data/*.csv (gitignored, six
                       # disjoint seed ranges: train/calibrate/validate/
                       # evidence/tracking/baseline — see ml/README.md)
python train.py       # ~3 min   — writes ml/artifacts/soft_sensor.json
python validate.py    # ~2-3 min — writes ml/artifacts/{metrics.json,calibration.png}
```

If `soft_sensor.json` is retrained, also refresh the frozen parity fixture
and re-check the two implementations still agree:

```bash
python export_parity_fixture.py   # from ml/, writes ml/artifacts/parity_fixture.json
cd .. && npm test                 # parity.test.ts checks TS vs. Python to 1e-6
```

**Verified, not assumed**: ran this exact sequence in a fresh venv, on a clean
copy of the working tree, immediately before writing this README.
`soft_sensor.json` came out byte-identical (SHA-256
`dc34a18c5241da6774955326cfeee31538e416b895173bcb48d5c2d1164bbf6f`) to the
committed one, and the resulting `metrics.json` matched the committed file
number-for-number (every field, zero differences) — the ML pipeline has no
run-to-run nondeterminism as currently written (fixed `random_state=1` on all
three models, no other randomness anywhere in the fit).

Full method, every intermediate finding, and the six-split reasoning are in
`ml/README.md` — this section is the short path, that file is the long one.

## Validation results

**Computed on**: `ml/validate.csv`, seeds `100000`–`100014` (15 held-out
shifts, 62,155 rows), a split the models never trained or calibrated on.
`ml/train.csv` (60 shifts, 248,589 rows) is shown only where noted, for the
overfit-gap comparison. The S6→S9 lead-time numbers come from a separate,
dedicated evidence set (`evidence.csv`, 300 S6-forced shifts) — see
`ml/README.md` for why that metric needs its own split.

**Soft-sensor accuracy** (blind + partial stations only — sensored stations
report ground truth directly and never go through this model):

| | Value |
|---|---|
| Overall MAE, held-out | 1.29s |
| Overall MAE, train | 1.25s (small overfit gap) |
| R², held-out | 0.867 |
| Skill vs. nominal-cycle baseline | **0.304** — modest, not dramatic |
| Skill vs. previous-visit baseline | 0.254 |

The soft sensor beats both naive baselines, but by roughly a quarter to a
third, not by an order of magnitude — MAE alone would have hidden this.

**Per-station R² is highly uneven, and about half of that unevenness is a
coverage artifact, not model weakness** — with only 15 validation shifts and
incidents randomly assigned across 10 target stations, three stations (S11,
S14, S17) drew **zero** incident-affected rows by chance, so their near-zero
R² (0.03–0.04) reflects the split, not the model. The rest is real and
unexplained by coverage: **P8 (688 incident rows) scores R² 0.17, and S6 —
the demo station — scores R² 0.19 on 71 incident rows.** A separate,
fixed-severity tracking test (150 shifts, `ml/artifacts/metrics.json`'s
`s6Tracking`) shows S6's prediction does converge to the true degraded value
after roughly one visit (MAE 2.08s at the first affected visit, ~1.1–1.4s
every visit after, matching the steady-state noise floor) — so the low R² is
a real per-visit-noise finding on a thin sample, not evidence the model never
tracks S6 at all.

**Confidence**: blind stations mean 0.60, partial stations mean 0.62 —
both well below the 0.90 ceiling this tier is allowed to reach. The
calibration curve itself is honest across the range the model actually
produces (0.58–0.81 on this split): predicted confidence tracks observed
accuracy closely once isotonic calibration is applied (before calibration,
the model said "11% confident" while being correct 76% of the time on those
rows — the fix, not a rounding footnote).

**Bottleneck alerting** (1.15× nominal cycle, unified debounced signal —
the exact function the live UI's Degrading tile commits on):

| Band | Precision | Recall | False-alarm rate |
|---|---|---|---|
| Easy (1.3×–2.0× nominal) | 0.790 | 0.994 | 0.23% |
| Marginal (1.10×–1.25× nominal) | 0.870 | **0.548** | 0.23% |

Precision on even the easy band is 0.79, not 1.0, once measured against the
true, heavily imbalanced steady-state base rate — a low false-alarm *rate*
can still coexist with mediocre precision when positives are rare.
**Marginal-band recall is 0.55: the model misses nearly half of
near-threshold incidents**, by design of what "marginal" means (deliberately
close to normal jitter) but a real limit, not a rounding error.

**S6→S9 starvation lead time** — the deliverable figure (what a live,
no-look-ahead system can actually warn with: the debounced alert, at the
tick a prediction is actually available) vs. physical headroom (the
undebounced, instant-crossing upper bound, kept separate and never quoted as
achievable):

| | Deliverable | Physical headroom |
|---|---|---|
| Easy median lead | **237.5s** | 476s |
| Easy range | [-2s, 927s] | [256s, 1,119s] |
| Easy causal fire rate | 100% (164/164) | 100% (164/164) |
| Marginal median lead | **963s** | 1,279s |
| Marginal range | [-9,363s, 1,841s] | [-16,238s, 2,320s] |
| Marginal causal fire rate | **69.9%** (93/136) | 86.0% (111/136) |

The easy band fires causally every time, with a positive lead time in all
164 evidence shifts. **The marginal band is the honest limit of this whole
mechanism**: 30% of marginal-severity incidents (41 of 136) never produce a
deliverable warning inside the causal horizon at all, and among the 93 that
do fire, lead time ranges as low as **-9,363 seconds** — a warning that
arrives after the buffer has already been empty for over two and a half
hours. This is reported because it is what the debounce and availability lag
actually cost on near-threshold cases, not smoothed into the headline number.

**Background false-positive rate for the whole starvation mechanism**: 0 of
200 no-incident baseline shifts produced a spontaneous S9 starvation — the
starvations paired against real incidents above are not coincidental.

## Limitations and what we do not claim

- **The line is simulated. We do not claim validation on real plant data,**
  anywhere, in any document this project produces. Every number above is
  computed on Stratify's own simulation.
- **We do not cite Bosch Kaggle competition accuracy figures as evidence this
  method works.** That competition's winning solutions exploited an ordering
  leak in row IDs, not physics, and citing them would be exactly the kind of
  overclaim this project exists to avoid.
- **42 stations is a line segment, not a plant.** A real automotive final
  assembly line runs roughly 200–500 stations; 42 was chosen to be
  demonstrable, and the scope is stated rather than implied to be a full
  plant.
- **No defect/quality model.** The two defect paths named in the demo
  incident (torque drift at S2, humidity drift at P3) are stated rules from
  `docs/assumptions.md`, not learned from data — there is no defect-injection
  model in the simulation to generate labelled training examples from, and
  no code anywhere in this engine computes a scrap or defect rate. The Plant
  Manager view's OEE figure is stated as Availability × Performance only,
  never as the full ISO 22400-2 three-factor product, for exactly this
  reason.
- **No operator concept.** There is no operator identity anywhere in this
  engine — showing "operator variation" would mean fabricating data, so the
  Plant Manager view reports shift-to-shift variation only, and says so.
- **Marginal-severity detection is a real, unresolved limit**, not a
  transient or a bug: 30% of near-threshold incidents produce no timely
  warning at all, and the worst observed case fires over two hours after the
  buffer emptied. Stated above, not smoothed over.
- **Instrumentation cost figures and the 4-windows/year maintenance cadence
  are stated assumptions**, not measurements or industry-sourced numbers —
  `docs/assumptions.md`'s "Pending verification" section marks the cost
  ranges as unverified as of 2026-08-25, and the Investment Case view
  withholds a payback figure entirely rather than convert an unverified
  number into one that looks precise.
- **Two adjacent blind stations are not separately identifiable from timing
  alone.** The twin abstains in this case rather than guessing, by design.

## Demo video and live URL

- Demo video: _[add before submission]_
- Live URL: https://stratify-mu-topaz.vercel.app
