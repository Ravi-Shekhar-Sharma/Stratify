/**
 * Headless runner: simulates a shift, writes ground truth and observable
 * streams to separate JSONL files (one JSON object per tick per line, so
 * they diff cleanly line-by-line), and prints a summary. Purpose: let a
 * human diff the two files directly and confirm the blind stations really
 * are blind — this is a manual-inspection tool, not a data export.
 *
 * Usage:
 *   npx tsx src/engine/run-shift.ts
 *   npx tsx src/engine/run-shift.ts --duration 3600 --seed 2 \
 *     --incident S6:0:80 --out out/shift
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHIFT_SECONDS } from './assumptions';
import { buildGroundTruthStream } from './signals/groundTruth';
import { deriveObservableStream } from './signals/observable';
import type { IncidentInjection } from './simulation';

function parseArgs(argv: string[]) {
  let durationSeconds = SHIFT_SECONDS;
  let seed = 1;
  let outDir = 'out/shift';
  const incidents: IncidentInjection[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--duration') durationSeconds = Number(argv[++i]);
    else if (arg === '--seed') seed = Number(argv[++i]);
    else if (arg === '--out') outDir = argv[++i];
    else if (arg === '--incident') {
      const [stationId, atTickStr, newCycleStr] = argv[++i].split(':');
      incidents.push({
        stationId,
        atTick: Number(atTickStr),
        newCycleSeconds: Number(newCycleStr),
      });
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { durationSeconds, seed, outDir, incidents };
}

function writeJsonl(path: string, rows: unknown[]): void {
  const lines = rows.map((row) => JSON.stringify(row));
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}

function main() {
  const { durationSeconds, seed, outDir, incidents } = parseArgs(process.argv.slice(2));

  console.log(
    `Simulating ${durationSeconds}s (seed ${seed})` +
      (incidents.length ? ` with incidents: ${JSON.stringify(incidents)}` : ' — undisturbed'),
  );

  const groundTruth = buildGroundTruthStream({ durationSeconds, seed, incidents });
  const observable = deriveObservableStream(groundTruth);

  mkdirSync(outDir, { recursive: true });
  const groundTruthPath = join(outDir, 'ground-truth.jsonl');
  const observablePath = join(outDir, 'observable.jsonl');
  writeJsonl(groundTruthPath, groundTruth);
  writeJsonl(observablePath, observable);

  console.log(`Wrote ${groundTruth.length} ticks to:`);
  console.log(`  ${groundTruthPath}  (ground truth — everything, including true cycle times)`);
  console.log(`  ${observablePath}  (observable — only what each station's tier permits)`);
  console.log(
    'Diff them (e.g. grep a blind station id out of each file) to confirm no field ' +
      'derived from true cycle time appears on the observable side.',
  );
}

main();
