/**
 * One-off diagnostic (not part of the regular pipeline): for a fixed list
 * of evidence.csv seeds, reconstructs the exact same incident (via the
 * same incidentsForShift used to generate that CSV, so there is no risk of
 * a second, drifting reimplementation), replays ground truth, and prints
 * per-tick state at the onset and starvation ticks to resolve whether a
 * reported "S9 starved" tick is a real production consequence or a
 * warmup transient from how the buffer is initialized.
 *
 * Usage: npx tsx src/engine/ml/diagnoseStarvationTiming.ts
 */
import { buildGroundTruthStream } from '../signals/groundTruth';
import { TRIM_CHASSIS_BUFFER } from '../topology';
import { SHIFT_SECONDS } from '../assumptions';
import { incidentsForShift } from './exportTrainingRows';

const SEEDS = [900275, 900219, 900253, 900015, 900227];

function main() {
  for (const seed of SEEDS) {
    const { incidents } = incidentsForShift(seed, 'S6', 1.0);
    const gt = buildGroundTruthStream({
      durationSeconds: SHIFT_SECONDS,
      seed,
      incidents,
      jitterFraction: 0.05,
    });

    const onsetTick = incidents[0].atTick;

    // Find the starvation tick by scanning the buffer level directly
    // (same logic as the exporter).
    let starvedTick = -1;
    let wasStarved = false;
    for (const tick of gt) {
      const level = tick.bufferLevels[TRIM_CHASSIS_BUFFER.id];
      const isStarved = level <= 0;
      if (isStarved && !wasStarved) {
        starvedTick = tick.tick;
        break;
      }
      wasStarved = isStarved;
    }

    // First tick each station is ever occupied.
    let s6FirstOccupiedTick = -1;
    let s9FirstOccupiedTick = -1;
    let s9OccupiedAtStarvedMinus1 = false;
    let s9EverOccupiedBeforeStarvation = false;

    for (const tick of gt) {
      const s6 = tick.stations.find((s) => s.stationId === 'S6')!;
      const s9 = tick.stations.find((s) => s.stationId === 'S9')!;
      if (s6FirstOccupiedTick === -1 && s6.occupied) s6FirstOccupiedTick = tick.tick;
      if (s9FirstOccupiedTick === -1 && s9.occupied) s9FirstOccupiedTick = tick.tick;
      if (tick.tick < starvedTick && s9.occupied) s9EverOccupiedBeforeStarvation = true;
      if (tick.tick === starvedTick - 1) s9OccupiedAtStarvedMinus1 = s9.occupied;
      if (tick.tick > starvedTick) break;
    }

    const atOnset = gt[onsetTick];
    const atStarve = gt[starvedTick];
    const s6AtOnset = atOnset.stations.find((s) => s.stationId === 'S6')!;
    const s9AtOnset = atOnset.stations.find((s) => s.stationId === 'S9')!;
    const s6AtStarve = atStarve.stations.find((s) => s.stationId === 'S6')!;
    const s9AtStarve = atStarve.stations.find((s) => s.stationId === 'S9')!;

    console.log(`\n=== seed ${seed} ===`);
    console.log(`incident: atTick=${onsetTick} newCycleSeconds=${incidents[0].newCycleSeconds}`);
    console.log(`starvation tick (buffer crosses to <=0): ${starvedTick}`);
    console.log(`S6 first-ever occupied tick: ${s6FirstOccupiedTick}`);
    console.log(`S9 first-ever occupied tick: ${s9FirstOccupiedTick}`);
    console.log(`--- at onset tick (${onsetTick}) ---`);
    console.log(`  S6.occupied=${s6AtOnset.occupied}  S9.occupied=${s9AtOnset.occupied}  ` +
      `bufferLevel=${atOnset.bufferLevels[TRIM_CHASSIS_BUFFER.id].toFixed(3)}`);
    console.log(`--- at starvation tick (${starvedTick}) ---`);
    console.log(`  S6.occupied=${s6AtStarve.occupied}  S9.occupied=${s9AtStarve.occupied}  ` +
      `bufferLevel=${atStarve.bufferLevels[TRIM_CHASSIS_BUFFER.id].toFixed(3)}`);
    console.log(`S9 occupied at (starvedTick-1)=${starvedTick - 1}: ${s9OccupiedAtStarvedMinus1}`);
    console.log(`S9 ever occupied before starvation: ${s9EverOccupiedBeforeStarvation}`);
  }
}

main();
