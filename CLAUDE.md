# Stratify

A live digital twin of a car assembly line that keeps working on the stations
nobody has instrumented.

Built for the Accenture Innovation Challenge 2026, Problem Track 4
DigitalTwin.ai. Round 1 cleared on the idea. Round 2 is graded on whether the
mechanism actually works and is validated.

## The problem we solve

Mainstream digital twins assume full sensor coverage. Real plants are a mix of
new and old equipment, so a meaningful minority of stations have little or no
sensor data. The twin goes blind precisely where the losses are hardest to see.
Stratify keeps estimating on those stations and always reports how confident it
is.

## The core mechanism, and the objection it answers

An earlier version of this project claimed a blind station is detectable because
parts pile up before it and run dry after it. That is wrong for automotive final
assembly, where stations are coupled on a continuously moving conveyor with
almost no work in progress between them. There is no queue to observe. Anyone
with automotive experience will raise this.

We infer from three signal classes instead:

1. Timing. Station entry and exit timestamps per vehicle, from barcode and RFID
   scans that already exist in the plant's MES. Zero new hardware.
2. Event. Andon pulls, line stops and cycle stop reason codes. These double as
   free labelled ground truth for training.
3. Occupancy. Buffer and queue depth, only where buffers genuinely exist, such
   as the Painted Body Store and inter-segment decoupling buffers.

One line: a blind station's state is written in the timing of the parts that
pass through it.

Which of the three classes a station exposes is its observability tier, and the
tier caps the confidence the twin can reach there. This is a first-class concept
in the code, not a comment.

## Non-negotiables

Read only. Stratify recommends and never controls. There is no write path to
line control anywhere in the codebase and there never will be. This is a
security and trust feature we actively sell, not a limitation we apologise for.

Confidence on every estimate. An inferred value is never presented without its
confidence. The UI must make measured and inferred visually distinguishable at a
glance.

Abstention. Below the confidence floor the twin refuses to estimate and states
why. Two adjacent blind stations are not separately identifiable from timing
alone, and saying so is more valuable than guessing.

Every prediction is scored. Predictions append to a trust ledger and are scored
against what actually happened. We show the false alarm rate rather than hiding
it. This is our main differentiator and no other team will have it.

Numbers come from docs/assumptions.md. Never from your judgment. If a number you
need is missing, stop and ask.

## Architecture

src/engine/      Pure TypeScript. Line simulation, signal layer, inference,
                 forward simulation for ripple prediction, defect correlation.
                 Forbidden from importing React or any UI module, enforced by a
                 test. This is what makes the logic independently verifiable.
src/engine/__tests__/
ml/              Python. Generates training data from the same line logic, fits
                 the soft sensor and defect models with scikit-learn, validates
                 on held-out data, exports models to JSON.
ml/artifacts/    Committed JSON: model parameters and metrics.json. The TS
                 engine reads these at runtime. Committing them is what makes
                 the metrics reproducible by a judge who never runs Python.
docs/            assumptions.md is the source of truth for every number.

Python trains, TypeScript serves. A parity test asserts both paths produce the
same output within 1e-6. If they diverge, the demo is lying.

## Stack

Whatever Bolt gave us for the app layer, kept unless there is a real reason to
change. React and TypeScript. No backend, no database, no auth. Judges will not
log in and a backend is a thing that can break on demo day.

Python for training only, standard library plus numpy, pandas, scikit-learn,
matplotlib. Gradient boosting on tabular data. No deep learning, it would take
longer and perform worse here.

## Working rules

Commit at every working state. Four day sprint, small commits are the only undo.

No mock data in anything a user sees. If a value is displayed, it was computed
by the engine. Round 1 was full of scripted values and every one of them is a
liability now.

Prefer deleting to carrying. Most of the Round 1 code is throwaway.

Do not add dependencies without telling me what problem it solves and what it
costs on a cold install.

Write the failing test first for anything in src/engine that produces a number a
judge will see.

## Skills and precedence

This project has third-party craft skills installed under .claude/skills. Use
them. They will make the interaction and animation work better than it would
otherwise be.

But they do not get to override the following, in this order:

1. docs/assumptions.md. Every number. No skill has an opinion about our takt time.
2. The design spec supplied with each view prompt. The colour tokens, the type
   scale, the zero radius and the motion rule are locked and validated, and a
   second person is building a pitch deck against them right now. If a skill
   suggests a different colour, a softer radius, a hover animation, or a
   different typeface, that suggestion is out of scope and you say so rather than
   applying it.
3. The avoid-list in the design spec. It is a hard exclusion list, not a
   preference. Notably: no Inter, Geist or Space Grotesk, no soft corner radius,
   no hover flourishes, no gradients, no emoji, no checkmark bullets, no
   decorative motion, no Lucide icons, no white backgrounds, no rainbow color,
   no glass/blur effects, no colored left stripes, no bento grids, no
   purple-and-black combos, no radial orbs, no dot grids, no sparkle icons, no
   animated arrows, no neon, no basic pastels.

Where a skill's advice is compatible with all three, apply it freely. Where it
conflicts, tell me what the skill wanted and what you did instead, in one line.
Do not silently pick either side.

Motion in particular: skills that specialise in animation will want to add
transitions. Our rule is that motion only fires when the underlying system state
actually changed, at 150 to 200ms, ease out. Entrance animations, hover
transitions and decorative easing are all out. Use the skill's craft to make the
permitted motion excellent rather than to add more of it.

## What we do not claim

We do not claim validation on real plant data. The line is simulated and the
README says so plainly in the first section. Overclaiming here is the fastest
way to lose credibility with judges who know this industry.

We do not quote accuracy figures from the Bosch Kaggle competition as evidence
this method works. The winning solutions exploited an ordering leak in the row
IDs rather than physics.

We never commit dataset files. Licences forbid redistribution.
