/**
 * The single place the bottleneck/degrading alert is computed for BOTH
 * consumers — the live UI (src/engine/inference/stationDisplay.ts, via
 * alertSignal.ts directly) and the offline evidence pipeline (this CLI,
 * invoked by ml/validate.py via subprocess, mirroring how
 * printMlConstants.ts already bridges a TS constant into Python). Neither
 * side re-derives the threshold-crossing/debounce logic itself; both call
 * resolveAlertSequence from src/engine/inference/alertSignal.ts on the SAME
 * model (predictSoftSensor, walking the trained artifact). This is what
 * "can't drift" means here — there is exactly one TypeScript implementation
 * of "what counts as an alert," full stop.
 *
 * Also computes `availableTick` per row: the tick a LIVE system actually
 * has this visit's prediction, not its entryTick. A prediction needs the
 * downstream neighbour's dwell (a model feature), so it cannot exist before
 * that visit has itself completed — availableTick = exitTick +
 * downstreamTransitSeconds + downstreamDwellSeconds (algebraically equal to
 * the downstream visit's own exitTick). Conflating this with entryTick is
 * exactly the bug that made the live UI's tile commit look ~6 minutes late
 * against the offline evidence number before this was fixed.
 *
 * Input: any CSV exportTrainingRows.ts produces (must include exitTick —
 * added alongside this script; regenerate older CSVs). Output: one row per
 * input row (same shiftSeed/stationId/vehicleId/entryTick join keys),
 * with predictedCycleSeconds, availableTick, and alertActive (0/1) —
 * alertActive is resolved PER (shiftSeed, stationId) GROUP, in entryTick
 * order, exactly as a live shift would accumulate history.
 *
 * Usage:
 *   npx tsx src/engine/ml/computeAlertColumn.ts \
 *     --csv ml/data/evidence.csv --artifact ml/artifacts/soft_sensor.json \
 *     --out ml/data/evidence_alert.csv
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  predictSoftSensor,
  MISSING_BUFFER_SENTINEL,
  MISSING_PROCESS_VALUE_SENTINEL,
  type SoftSensorFeatures,
} from '../inference/softSensor';
import { resolveAlertSequence } from '../inference/alertSignal';
import { ALERT_MULTIPLIER } from '../assumptions';

const FEATURE_COLUMNS: (keyof SoftSensorFeatures)[] = [
  'stationIndexInLine',
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
  // bufferLevelAtEntry, targetProcessValue, isPartialTier handled separately
  // below (sentinel / derived), not read directly as a plain number column.
];

export interface Row {
  raw: Record<string, string>;
  shiftSeed: number;
  stationId: string;
  vehicleId: number;
  entryTick: number;
  exitTick: number;
  nominalCycleSeconds: number;
  downstreamTransitSeconds: number;
  downstreamDwellSeconds: number;
}

export interface AlertColumns {
  predictedCycleSeconds: number[];
  availableTick: number[];
  alertActive: (0 | 1)[];
}

function parseCsv(path: string): { header: string[]; rows: Row[] } {
  const text = readFileSync(path, 'utf-8');
  const lines = text.split('\n').filter((l) => l.length > 0);
  const header = lines[0].split(',');
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].split(',');
    const raw: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) raw[header[c]] = fields[c];
    rows.push({
      raw,
      shiftSeed: Number(raw.shiftSeed),
      stationId: raw.stationId,
      vehicleId: Number(raw.vehicleId),
      entryTick: Number(raw.entryTick),
      exitTick: Number(raw.exitTick),
      nominalCycleSeconds: Number(raw.nominalCycleSeconds),
      downstreamTransitSeconds: Number(raw.downstreamTransitSeconds),
      downstreamDwellSeconds: Number(raw.downstreamDwellSeconds),
    });
  }
  return { header, rows };
}

function numericOrSentinel(value: string, sentinel: number): number {
  if (value === undefined || value === '') return sentinel;
  const n = Number(value);
  return Number.isNaN(n) ? sentinel : n;
}

export function buildFeatures(row: Row): SoftSensorFeatures {
  const features = { isPartialTier: row.raw.tier === 'partial' ? 1 : 0 } as SoftSensorFeatures;
  for (const col of FEATURE_COLUMNS) {
    (features as unknown as Record<string, number>)[col] = Number(row.raw[col]);
  }
  features.bufferLevelAtEntry = numericOrSentinel(row.raw.bufferLevelAtEntry, MISSING_BUFFER_SENTINEL);
  features.targetProcessValue = numericOrSentinel(row.raw.targetProcessValue, MISSING_PROCESS_VALUE_SENTINEL);
  return features;
}

function parseArgs(argv: string[]) {
  let csv = '';
  let out = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--csv') csv = argv[++i];
    else if (argv[i] === '--out') out = argv[++i];
    else if (argv[i] === '--artifact') i++; // accepted, unused: softSensor.ts bundles the artifact directly
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!csv || !out) throw new Error('Usage: --csv <path> --out <path> [--artifact <path>]');
  return { csv, out };
}

/**
 * Pure core: groups rows by (shiftSeed, stationId), walks each group in
 * entryTick order computing predictions + availableTick, then debounces
 * the alert via resolveAlertSequence exactly as a live shift would
 * accumulate history. Extracted from main() so it's unit-testable without
 * file I/O — see src/engine/ml/__tests__/computeAlertColumn.test.ts.
 */
export function computeAlertColumnsForRows(rows: readonly Row[]): AlertColumns {
  const predictedCycleSeconds = new Array<number>(rows.length);
  const availableTick = new Array<number>(rows.length);
  const alertActive = new Array<0 | 1>(rows.length);

  // Group row INDICES (not copies) by (shiftSeed, stationId), preserving a
  // way back to the original row order for output.
  const groups = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const key = `${row.shiftSeed} ${row.stationId}`;
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  });

  for (const indices of groups.values()) {
    indices.sort((a, b) => rows[a].entryTick - rows[b].entryTick);

    const cycleTimes: number[] = [];
    for (const i of indices) {
      const prediction = predictSoftSensor(buildFeatures(rows[i]));
      predictedCycleSeconds[i] = prediction.cycleTimeSeconds;
      cycleTimes.push(prediction.cycleTimeSeconds);
      availableTick[i] = rows[i].exitTick + rows[i].downstreamTransitSeconds + rows[i].downstreamDwellSeconds;
    }

    const threshold = rows[indices[0]].nominalCycleSeconds * ALERT_MULTIPLIER;
    const activeSeq = resolveAlertSequence(cycleTimes, threshold);
    indices.forEach((i, pos) => {
      alertActive[i] = activeSeq[pos] ? 1 : 0;
    });
  }

  return { predictedCycleSeconds, availableTick, alertActive };
}

function main() {
  const { csv, out } = parseArgs(process.argv.slice(2));
  const { rows } = parseCsv(csv);
  const { predictedCycleSeconds, availableTick, alertActive } = computeAlertColumnsForRows(rows);

  const outColumns = ['shiftSeed', 'stationId', 'vehicleId', 'entryTick', 'predictedCycleSeconds', 'availableTick', 'alertActive'];
  const lines = [outColumns.join(',')];
  rows.forEach((row, i) => {
    lines.push(
      [row.shiftSeed, row.stationId, row.vehicleId, row.entryTick, predictedCycleSeconds[i], availableTick[i], alertActive[i]].join(','),
    );
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join('\n') + '\n', 'utf-8');
  const groupCount = new Set(rows.map((r) => `${r.shiftSeed} ${r.stationId}`)).size;
  console.log(`Wrote ${rows.length} rows to ${out} (${groupCount} shift/station groups, ALERT_MULTIPLIER=${ALERT_MULTIPLIER})`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) main();
