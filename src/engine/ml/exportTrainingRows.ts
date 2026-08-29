/**
 * ML training-row exporter. Runs simulated shifts, extracts per-station
 * visits from ground truth (needs ground truth for the label — this is a
 * training pipeline, not the inference runtime, so it is not subject to
 * src/engine/inference's ground-truth import ban), joins each blind or
 * partial station's visit (neither tier gets true cycle time) against its
 * immediate upstream/downstream neighbour for the SAME vehicle, and writes
 * one CSV row per joined visit.
 *
 * All line-timing and topology knowledge (who is upstream of whom, where
 * the named buffers sit, which station an incident targets, when S9
 * starves) stays here — Python only trains and validates on the flat CSV
 * this produces. This is the "do not reimplement the line in Python"
 * boundary.
 *
 * Usage:
 *   npx tsx src/engine/ml/exportTrainingRows.ts --shifts 40 --seedStart 1 \
 *     --out ml/data/train.csv --jitter 0.05
 *   # dedicated S6-incident set for the S9-starvation lead-time evidence:
 *   npx tsx src/engine/ml/exportTrainingRows.ts --shifts 40 --seedStart 9000 \
 *     --out ml/data/evidence.csv --jitter 0.05 --forceStation S6 --incidentRate 1
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildGroundTruthStream } from '../signals/groundTruth';
import { extractVisits, type Visit } from './visits';
import { STATIONS, TAKT_SECONDS } from '../stations';
import { NAMED_BUFFERS } from '../topology';
import {
  SHIFT_SECONDS,
  MARGINAL_SEVERITY_MULTIPLIER_RANGE,
  EASY_SEVERITY_MULTIPLIER_RANGE,
} from '../assumptions';
import { createRng } from '../rng';
import type { IncidentInjection } from '../simulation';

// Blind AND partial: neither tier gets true cycle time (only sensored
// does), so both need the soft sensor. Partial additionally gets one named
// process value (targetProcessValue below) — that's the whole point of
// comparing the two tiers in validate.py's per-tier breakdown.
const TARGET_STATIONS = STATIONS.filter((s) => s.tier === 'blind' || s.tier === 'partial');
const TARGET_STATION_IDS = TARGET_STATIONS.map((s) => s.id);
const TIER_BY_STATION = new Map(TARGET_STATIONS.map((s) => [s.id, s.tier]));
const STATION_INDEX = new Map(STATIONS.map((s, i) => [s.id, i]));
const STATION_ORDER = STATIONS.map((s) => s.id);

/** True iff `stationId` sits immediately downstream of `buffer` (buffer feeds it). */
function bufferFeedingInto(stationId: string) {
  return NAMED_BUFFERS.find((b) => b.upstreamOf === stationId);
}

export interface TrainingRow {
  shiftSeed: number;
  stationId: string;
  tier: string;
  stationIndexInLine: number;
  vehicleId: number;
  entryTick: number;
  nominalCycleSeconds: number;
  upstreamDwellSeconds: number;
  upstreamTransitSeconds: number;
  downstreamDwellSeconds: number;
  downstreamTransitSeconds: number;
  targetAndon: 0 | 1;
  targetBlocked: 0 | 1;
  upstreamAndon: 0 | 1;
  upstreamBlocked: 0 | 1;
  downstreamAndon: 0 | 1;
  downstreamBlocked: 0 | 1;
  downstreamStarved: 0 | 1;
  bufferLevelAtEntry: number | '';
  /** The target's own permitted process-value reading — empty for blind
   *  stations (they don't get one), present for partial. Not derived from
   *  cycle time; it's a separate physical quantity (e.g. torque). */
  targetProcessValue: number | '';
  /** True iff an injected incident is active at THIS station at THIS visit
   *  (station matches the shift's incident target, and entryTick is at or
   *  after its injection tick). Ground truth, not inferred — this is what
   *  lets Python separate steady-state rows from incident-tracking rows
   *  without guessing from the noisy label alone. */
  trueIncidentActive: 0 | 1;
  /** The shift's incident severity band ('none' if trueIncidentActive is 0
   *  for this row) — computed from the KNOWN injected multiplier, not
   *  re-derived from the noisy observed trueCycleSeconds in Python, since
   *  jitter makes the marginal/easy bands overlap right at the boundary
   *  (marginal's top with jitter can exceed easy's bottom without jitter). */
  severityBand: 'none' | 'marginal' | 'easy';
  /** Shift-level: tick S9 first starved this shift, or '' if it never did.
   *  Broadcast onto every row of the shift so Python can compute alert ->
   *  starvation lead time without a second file. */
  s9StarvedTick: number | '';
  /** 0 for the first visit at this station where trueIncidentActive first
   *  becomes 1, 1 for the next, etc. — lets Python analyze how predictions
   *  converge across successive visits after a degradation starts, without
   *  re-deriving visit order from entryTick itself. '' for steady-state
   *  rows (trueIncidentActive = 0). */
  visitIndexSinceIncident: number | '';
  trueCycleSeconds: number;
}

export type SeverityBand = 'none' | 'marginal' | 'easy';

/**
 * Deterministic, seed-derived incident schedule. Three outcomes per shift:
 * no incident (steady state), a "marginal" incident at 1.10x-1.25x nominal
 * (the honest test — close enough to normal jitter that separating it from
 * noise is a real classification problem), or an "easy" incident at
 * 1.3x-2.0x (clearly separable). `incidentRate` is P(any incident); within
 * that, marginal vs easy is a fair coin flip, so the default incidentRate
 * of 2/3 gives roughly equal thirds across all three outcomes. A random
 * tick with enough runway left in the shift to observe its effect.
 *
 * `forceStationId` overrides the random station pick (used to build a
 * dedicated S6-only evidence set for the S9-starvation lead-time metric —
 * that metric is only meaningful for incidents inside the trim segment
 * feeding the trim-to-chassis buffer, and S6 is the one the demo is about).
 * `incidentRate` of 1 removes the "no incident" outcome entirely.
 * `forceCycleSeconds` bypasses the marginal/easy randomization and injects
 * exactly this degraded cycle every time (used for the S6 tracking
 * analysis — the demo's canonical 80s degradation, not a random severity,
 * so per-visit convergence can be measured cleanly across many runs of the
 * SAME severity rather than averaged across a mix).
 */
function incidentsForShift(
  seed: number,
  forceStationId?: string,
  incidentRate = 2 / 3,
  forceCycleSeconds?: number,
): { incidents: IncidentInjection[]; band: SeverityBand } {
  // Draw order below is preserved exactly as it was before forceCycleSeconds
  // existed, for every seed that doesn't pass it — reordering these calls
  // would silently reshuffle which incident severity/timing every existing
  // seed produces, changing train/calibrate/validate data that the current
  // soft_sensor.json was fit against without anyone asking for that.
  const rng = createRng(seed * 2654435761 + 7);
  if (rng() > incidentRate) return { incidents: [], band: 'none' };

  const stationId = forceStationId ?? TARGET_STATION_IDS[Math.floor(rng() * TARGET_STATION_IDS.length)];
  const nominal = STATIONS.find((s) => s.id === stationId)!.nominalCycleSeconds;
  const isMarginal = rng() < 0.5;
  const [marginalLo, marginalHi] = MARGINAL_SEVERITY_MULTIPLIER_RANGE;
  const [easyLo, easyHi] = EASY_SEVERITY_MULTIPLIER_RANGE;
  const multiplier = isMarginal
    ? marginalLo + rng() * (marginalHi - marginalLo)
    : easyLo + rng() * (easyHi - easyLo);
  const atTick = Math.floor(rng() * (SHIFT_SECONDS - 3600)); // leave >=1hr runway

  if (forceCycleSeconds !== undefined) {
    const band: SeverityBand = forceCycleSeconds / nominal >= EASY_SEVERITY_MULTIPLIER_RANGE[0]
      ? 'easy'
      : 'marginal';
    return { incidents: [{ stationId, atTick, newCycleSeconds: forceCycleSeconds }], band };
  }

  return {
    incidents: [{ stationId, atTick, newCycleSeconds: Math.round(nominal * multiplier) }],
    band: isMarginal ? 'marginal' : 'easy',
  };
}

function findVisitCovering(
  visits: Visit[] | undefined,
  vehicleId: number,
): Visit | undefined {
  return visits?.find((v) => v.vehicleId === vehicleId);
}

function exportShift(
  seed: number,
  jitterFraction: number,
  forceStationId: string | undefined,
  incidentRate: number,
  forceCycleSeconds: number | undefined,
): TrainingRow[] {
  const { incidents, band } = incidentsForShift(seed, forceStationId, incidentRate, forceCycleSeconds);
  const gt = buildGroundTruthStream({ durationSeconds: SHIFT_SECONDS, seed, incidents, jitterFraction });
  const visitsByStation = extractVisits(gt);

  // Buffer level at any tick, per named buffer id.
  const bufferLevelAt = new Map<number, Record<string, number>>();
  for (const tick of gt) bufferLevelAt.set(tick.tick, tick.bufferLevels);

  // S9's first starved tick this shift, if any — scan its own event stream.
  let s9StarvedTick: number | '' = '';
  outer: for (const tick of gt) {
    for (const s of tick.stations) {
      if (s.stationId === 'S9' && s.events.some((e) => e.kind === 'starved')) {
        s9StarvedTick = tick.tick;
        break outer;
      }
    }
  }

  const incident = incidents[0];

  const rows: TrainingRow[] = [];

  for (const stationId of TARGET_STATION_IDS) {
    const idx = STATION_INDEX.get(stationId)!;
    const upstreamId = STATION_ORDER[idx - 1];
    const downstreamId = STATION_ORDER[idx + 1];
    const targetVisits = visitsByStation.get(stationId) ?? [];
    const upstreamVisits = visitsByStation.get(upstreamId);
    const downstreamVisits = visitsByStation.get(downstreamId);
    const feedingBuffer = bufferFeedingInto(stationId);
    const nominalCycleSeconds = STATIONS.find((s) => s.id === stationId)!.nominalCycleSeconds;
    let visitsSinceIncident = 0;

    for (const visit of targetVisits) {
      const up = findVisitCovering(upstreamVisits, visit.vehicleId);
      const down = findVisitCovering(downstreamVisits, visit.vehicleId);
      if (!up || !down) continue; // truncated at shift boundary — skip, incomplete features

      const bufferLevelAtEntry = feedingBuffer
        ? (bufferLevelAt.get(visit.entryTick)?.[feedingBuffer.id] ?? '')
        : '';

      const trueIncidentActive: 0 | 1 =
        incident && incident.stationId === stationId && visit.entryTick >= incident.atTick ? 1 : 0;
      const rowSeverityBand: SeverityBand = trueIncidentActive ? band : 'none';
      const visitIndexSinceIncident: number | '' = trueIncidentActive ? visitsSinceIncident++ : '';

      rows.push({
        shiftSeed: seed,
        stationId,
        tier: TIER_BY_STATION.get(stationId)!,
        stationIndexInLine: idx,
        vehicleId: visit.vehicleId,
        entryTick: visit.entryTick,
        nominalCycleSeconds,
        upstreamDwellSeconds: up.exitTick - up.entryTick,
        upstreamTransitSeconds: visit.entryTick - up.exitTick,
        downstreamDwellSeconds: down.exitTick - down.entryTick,
        downstreamTransitSeconds: down.entryTick - visit.exitTick,
        targetAndon: visit.hadAndon ? 1 : 0,
        targetBlocked: visit.hadBlocked ? 1 : 0,
        upstreamAndon: up.hadAndon ? 1 : 0,
        upstreamBlocked: up.hadBlocked ? 1 : 0,
        downstreamAndon: down.hadAndon ? 1 : 0,
        downstreamBlocked: down.hadBlocked ? 1 : 0,
        downstreamStarved: down.hadStarved ? 1 : 0,
        bufferLevelAtEntry,
        targetProcessValue: visit.processValue ?? '',
        trueIncidentActive,
        severityBand: rowSeverityBand,
        s9StarvedTick,
        visitIndexSinceIncident,
        trueCycleSeconds: visit.trueCycleSeconds,
      });
    }
  }

  return rows;
}

const CSV_COLUMNS: (keyof TrainingRow)[] = [
  'shiftSeed',
  'stationId',
  'tier',
  'stationIndexInLine',
  'vehicleId',
  'entryTick',
  'nominalCycleSeconds',
  'upstreamDwellSeconds',
  'upstreamTransitSeconds',
  'downstreamDwellSeconds',
  'downstreamTransitSeconds',
  'targetAndon',
  'targetBlocked',
  'upstreamAndon',
  'upstreamBlocked',
  'downstreamAndon',
  'downstreamBlocked',
  'downstreamStarved',
  'bufferLevelAtEntry',
  'targetProcessValue',
  'trueIncidentActive',
  'severityBand',
  's9StarvedTick',
  'visitIndexSinceIncident',
  'trueCycleSeconds',
];

function writeCsv(path: string, rows: TrainingRow[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => String(row[c])).join(','));
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

function parseArgs(argv: string[]) {
  let shifts = 40;
  let seedStart = 1;
  let out = 'ml/data/train.csv';
  // 0 by default (deterministic, matches every other consumer of this
  // simulation). ML data generation passes a nonzero value explicitly —
  // see ml/generate.py — because a noiseless label makes the regression
  // problem trivially easy and the resulting metrics dishonestly flattering.
  let jitterFraction = 0;
  let forceStationId: string | undefined;
  let incidentRate = 2 / 3;
  let forceCycleSeconds: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--shifts') shifts = Number(argv[++i]);
    else if (argv[i] === '--seedStart') seedStart = Number(argv[++i]);
    else if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--jitter') jitterFraction = Number(argv[++i]);
    else if (argv[i] === '--forceStation') forceStationId = argv[++i];
    else if (argv[i] === '--incidentRate') incidentRate = Number(argv[++i]);
    else if (argv[i] === '--forceCycleSeconds') forceCycleSeconds = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return { shifts, seedStart, out, jitterFraction, forceStationId, incidentRate, forceCycleSeconds };
}

function main() {
  const { shifts, seedStart, out, jitterFraction, forceStationId, incidentRate, forceCycleSeconds } =
    parseArgs(process.argv.slice(2));
  const allRows: TrainingRow[] = [];
  const bandCounts: Record<SeverityBand, number> = { none: 0, marginal: 0, easy: 0 };

  for (let i = 0; i < shifts; i++) {
    const seed = seedStart + i;
    const { band } = incidentsForShift(seed, forceStationId, incidentRate, forceCycleSeconds);
    bandCounts[band]++;
    const rows = exportShift(seed, jitterFraction, forceStationId, incidentRate, forceCycleSeconds);
    allRows.push(...rows);
    console.log(`shift seed=${seed}: ${rows.length} rows, band=${band}`);
  }

  writeCsv(out, allRows);
  console.log(
    `Wrote ${allRows.length} rows from ${shifts} shifts ` +
      `(none=${bandCounts.none}, marginal=${bandCounts.marginal}, easy=${bandCounts.easy}) to ${out}`,
  );
  console.log(`Every target station's nominalCycleSeconds is takt (${TAKT_SECONDS}s) in this topology.`);
}

main();
