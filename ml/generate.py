#!/usr/bin/env python3
"""Drive the TypeScript line model to produce training, calibration,
validation, S9-starvation-evidence, and S6-tracking data.

This script does not simulate anything itself — it only invokes the TS CLI
(src/engine/ml/exportTrainingRows.ts) and checks its exit code. All line
timing, topology, incident-injection, and feature-engineering knowledge
lives in TypeScript; two independent implementations of the line would
drift, and this project has exactly one.

Five disjoint seed ranges, so nothing here can leak across splits:
  train      seeds 1..N              fits the models
  calibrate  seeds 50,000..50,000+M   fits the confidence calibration map
             (isotonic regression) — must be disjoint from both train and
             validate, or the calibration would be measuring its own fit
  validate   seeds 100,000..100,000+K final, untouched scoring split
  evidence   seeds 900,000..900,000+E forced to inject at S6 every shift,
             random marginal/easy severity — the S9-starvation lead-time
             metric, only meaningful for incidents inside the trim segment
             feeding the trim-to-chassis buffer
  tracking   seeds 950,000..950,000+T forced to inject at S6 every shift,
             FIXED at the canonical 80s degradation (not a random
             severity) — for measuring whether predictions converge to the
             true value across successive visits after onset
  baseline   seeds 990,000..990,000+B NO incident ever (incidentRate=0),
             pure steady state — establishes the background/spontaneous
             S9-starvation rate from jitter noise alone, so an incident-set
             starvation can be judged causal vs. coincidental against it

Jitter, the alert multiplier, and the severity bands come from
src/engine/assumptions.ts via src/engine/ml/printMlConstants.ts — not
hardcoded here. See docs/assumptions.md, "## ML modelling choices".

Usage:
    python ml/generate.py
    python ml/generate.py --train-shifts 60 --validate-shifts 15
"""
import argparse
import subprocess
import sys
from pathlib import Path

import model as sensor

REPO_ROOT = Path(__file__).resolve().parent.parent
EXPORTER = "src/engine/ml/exportTrainingRows.ts"


def run_exporter(shifts: int, seed_start: int, out: Path,
                  jitter: float,
                  force_station: str | None = None,
                  incident_rate: float | None = None,
                  force_cycle_seconds: float | None = None) -> None:
    cmd = [
        "npx", "tsx", EXPORTER,
        "--shifts", str(shifts),
        "--seedStart", str(seed_start),
        "--out", str(out),
        "--jitter", str(jitter),
    ]
    if force_station:
        cmd += ["--forceStation", force_station]
    if incident_rate is not None:
        cmd += ["--incidentRate", str(incident_rate)]
    if force_cycle_seconds is not None:
        cmd += ["--forceCycleSeconds", str(force_cycle_seconds)]
    print(f"$ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=REPO_ROOT, shell=(sys.platform == "win32"))
    if result.returncode != 0:
        raise SystemExit(f"TS exporter failed (exit {result.returncode}): {' '.join(cmd)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-shifts", type=int, default=60)
    parser.add_argument("--calibrate-shifts", type=int, default=20)
    parser.add_argument("--validate-shifts", type=int, default=15)
    parser.add_argument("--evidence-shifts", type=int, default=300)
    parser.add_argument("--tracking-shifts", type=int, default=150)
    parser.add_argument("--baseline-shifts", type=int, default=200)
    parser.add_argument("--train-seed-start", type=int, default=1)
    parser.add_argument("--calibrate-seed-start", type=int, default=50_000)
    parser.add_argument("--validate-seed-start", type=int, default=100_000)
    parser.add_argument("--evidence-seed-start", type=int, default=900_000)
    parser.add_argument("--tracking-seed-start", type=int, default=950_000)
    parser.add_argument("--baseline-seed-start", type=int, default=990_000)
    parser.add_argument("--out-dir", type=Path, default=REPO_ROOT / "ml" / "data")
    args = parser.parse_args()

    ranges = [
        ("train", args.train_seed_start, args.train_shifts),
        ("calibrate", args.calibrate_seed_start, args.calibrate_shifts),
        ("validate", args.validate_seed_start, args.validate_shifts),
        ("evidence", args.evidence_seed_start, args.evidence_shifts),
        ("tracking", args.tracking_seed_start, args.tracking_shifts),
        ("baseline", args.baseline_seed_start, args.baseline_shifts),
    ]
    for i, (name_a, start_a, n_a) in enumerate(ranges):
        for name_b, start_b, n_b in ranges[i + 1:]:
            if start_a < start_b + n_b and start_b < start_a + n_a:
                raise SystemExit(f"Seed ranges for {name_a} and {name_b} overlap - fix seed starts.")

    args.out_dir.mkdir(parents=True, exist_ok=True)

    const = sensor.ml_constants()
    jitter = const["cycleTimeJitterFraction"]
    s6_degraded = const["s6DegradedCycleSeconds"]
    print(f"Read from src/engine/assumptions.ts: jitter={jitter}, "
          f"alertMultiplier={const['alertMultiplier']}, s6DegradedCycleSeconds={s6_degraded}")

    print(f"\nGenerating {args.train_shifts} training shifts "
          f"(seeds {args.train_seed_start}..{args.train_seed_start + args.train_shifts - 1})")
    run_exporter(args.train_shifts, args.train_seed_start, args.out_dir / "train.csv", jitter)

    print(f"\nGenerating {args.calibrate_shifts} calibration shifts (seeds "
          f"{args.calibrate_seed_start}..{args.calibrate_seed_start + args.calibrate_shifts - 1}) "
          f"- fits the confidence calibration map only, never the models")
    run_exporter(args.calibrate_shifts, args.calibrate_seed_start, args.out_dir / "calibrate.csv", jitter)

    print(f"\nGenerating {args.validate_shifts} held-out validation shifts (seeds "
          f"{args.validate_seed_start}..{args.validate_seed_start + args.validate_shifts - 1}) "
          f"- untouched by training or calibration")
    run_exporter(args.validate_shifts, args.validate_seed_start, args.out_dir / "validate.csv", jitter)

    print(f"\nGenerating {args.evidence_shifts} S6-forced evidence shifts (seeds "
          f"{args.evidence_seed_start}..{args.evidence_seed_start + args.evidence_shifts - 1}) "
          f"- for the S9-starvation lead-time metric, random marginal/easy severity")
    run_exporter(args.evidence_shifts, args.evidence_seed_start, args.out_dir / "evidence.csv", jitter,
                 force_station="S6", incident_rate=1.0)

    print(f"\nGenerating {args.tracking_shifts} S6-forced tracking shifts (seeds "
          f"{args.tracking_seed_start}..{args.tracking_seed_start + args.tracking_shifts - 1}) "
          f"- fixed at the canonical {s6_degraded}s degradation, for per-visit convergence analysis")
    run_exporter(args.tracking_shifts, args.tracking_seed_start, args.out_dir / "tracking.csv", jitter,
                 force_station="S6", incident_rate=1.0, force_cycle_seconds=s6_degraded)

    print(f"\nGenerating {args.baseline_shifts} no-incident baseline shifts (seeds "
          f"{args.baseline_seed_start}..{args.baseline_seed_start + args.baseline_shifts - 1}) "
          f"- incidentRate=0, establishes the background/spontaneous S9-starvation rate")
    run_exporter(args.baseline_shifts, args.baseline_seed_start, args.out_dir / "baseline.csv", jitter,
                 incident_rate=0.0)

    print(f"\nDone. All CSVs under {args.out_dir} are gitignored - never committed.")


if __name__ == "__main__":
    main()
