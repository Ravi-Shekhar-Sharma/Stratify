# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Stratify is a digital twin for a car final-assembly line, built for the Accenture Innovation Challenge 2026 (Problem Track 4, DigitalTwin.ai), Round 2 — a 4-day sprint. The core idea: infer state at uninstrumented ("blind") stations from timing, event, and occupancy signals from neighbouring stations, rather than from buffer pile-up. Automotive final assembly is a coupled conveyor with near-zero WIP between stations, so there's no queue to observe — the earlier buffer-based approach doesn't apply here.

Round 1 was won on the idea; Round 2 is graded on whether the inference mechanism actually works and is validated. Do not claim real-plant validation — the line is simulated. Do not cite Bosch Kaggle accuracy figures (that competition had a row-ID ordering leak).

## Current state of the repo

Only the frontend shell exists so far, imported from a Bolt.new export (`vite-react-typescript-starter` template). It's a **scripted UI prototype**: `src/useTwinState.ts` plays back a fixed, hardcoded 5-second timeline of state changes (`runIncident()`) with no real inference behind it. This is the demo storyboard, not the mechanism.

Not yet built (per the target architecture below): `src/engine` (the actual inference logic), `ml/` (Python training), `ml/artifacts/`, `docs/assumptions.md`. When these appear, treat them as the source of truth over the current scripted demo.

## Commands

```
npm run dev        # Vite dev server
npm run build      # production build
npm run lint       # eslint .
npm run typecheck  # tsc --noEmit -p tsconfig.app.json
npm run preview    # preview a production build
```

No test runner is configured yet. Non-negotiable per project rules: engine numbers must be test-first once `src/engine` exists — set up a test runner at that point rather than skipping tests.

## Target architecture (per project spec)

- `src/engine` — pure TypeScript inference logic, **no React imports**. This is where blind-station state estimates and confidence scores are computed.
- `ml/` — Python model training.
- `ml/artifacts/` — trained model outputs, committed as JSON.
- `docs/assumptions.md` — the sole source of numeric constants (cycle times, takt, throughput rates, confidence values). Currently these numbers live inline in `src/model.ts`; once `docs/assumptions.md` exists, it is authoritative and `src/model.ts` should read from/match it, not the other way around.

### Non-negotiables

- Read-only twin: no line control. The UI must never imply Stratify can stop or adjust the physical line — see the `RecommendedAction` copy ("Stratify never stops the line. A person decides.").
- Every inferred estimate carries a confidence value (see `Station.confidence`, `TagKind: 'MEASURED' | 'INFERRED'`).
- Abstain below a confidence floor rather than presenting a low-confidence guess as fact.
- Every prediction gets scored in a trust ledger (not yet implemented).
- No mock data in anything user-visible once the real engine exists — the current scripted `runIncident()` timeline is a bridge, not the end state.
- Do not add dependencies without stating the problem solved and the cold-install cost.
- Never commit dataset files.

## Frontend structure

- `src/App.tsx` — top-level layout and view switcher (`twin` vs `flow` pipeline view). Renders `StatusBar`, `StationRow`, three side-by-side panels (`ConfidenceRing`, `PredictionPanel`, `EventsFeed`), and `RecommendedAction`.
- `src/useTwinState.ts` — single stateful hook holding all twin state (`connecting` → `steady` → `incident` phase machine). `runIncident()` is a `setTimeout`-scheduled scripted sequence, not live computation. `reset()` clears timers and returns to steady state.
- `src/model.ts` — static station config and constants (station order/names, rest cycle times, takt, throughput rates, FTT, S6 confidence values). These numbers are provisional pending `docs/assumptions.md`.
- `src/types.ts` — shared domain types (`Station`, `BufferState`, `EventLine`, `PredictionState`, `RecommendationState`).
- `src/components/` — presentational components, each taking state as props (no internal data fetching or global state). Notable: `StationCard`/`StationRow` (per-station display with MEASURED/INFERRED tagging), `ConfidenceRing` (confidence visualization for the blind station), `FlowDiagram` (pipeline view), `Buffer` (inter-station buffer fill indicator).
- Path alias `@/*` → `src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`). Use `@/...` imports, not deep relative paths.

## Design system — strict precedence order

When these conflict, resolve in this order and never silently pick one: **1) `docs/assumptions.md`** (numeric ground truth) **> 2) the per-view design spec** (locked colour tokens, type scale, zero radius, motion rule) **> 3) the design spec's avoid-list**. Third-party craft skills under `.claude/skills` apply only where compatible with all three; if a skill's suggestion conflicts, surface the conflict in one line rather than resolving it silently.

Locked tokens (`tailwind.config.js`, `src/index.css`):
- Colors are functional-state signals, not decoration: `measured` (#3FB38B green), `inferred` (#56B6E0 cyan), `slowing` (#E0A83E amber), `starved` (#E45B4A red). Surfaces are near-black (`bg` #0A0D11, `panel` #10151B). Text uses the `ink-*` scale (primary/secondary/muted/faint).
- Fonts: IBM Plex Sans (UI), IBM Plex Mono with tabular-nums (all numeric/mono readouts).
- Near-zero corner radius (`borderRadius: 3` inline, or square) — not the Tailwind default rounded look.
- Motion rule: animate only on real state change, 150–200ms, ease-out. No entrance, hover, or decorative animation. `prefers-reduced-motion` is already respected globally in `src/index.css`.

Avoid-list: no Inter/Geist/Space Grotesk, no soft/large border radius, no hover flourishes, no gradients, no emoji, no checkmark bullets, no decorative motion.
