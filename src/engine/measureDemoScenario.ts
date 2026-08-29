/**
 * One-off measurement (not part of the app or the ML pipeline): runs the
 * exact demo scenario the "Run Incident" button injects (src/engine/demoScenario.ts
 * — same seed, same jitter, same incident) and prints real numbers instead
 * of guessing:
 *
 *   1. S6's calibrated confidence — rest-state distribution, and the full
 *      trajectory from incident onset to its peak — plus rest-state
 *      confidence for the other five blind stations.
 *   2. The trim-to-chassis buffer's TRUE (hindsight, tick-resolution) drain
 *      duration vs. what the live UI's smoothed estimator would have
 *      actually displayed, sampled at the same cadence the UI samples at.
 *   3. Wall-clock timing: how long "Run Incident" takes to reach onset, how
 *      long the drain arc takes on screen, and how long a full shift takes,
 *      all at the live playback multiple.
 *
 * Every number here uses the SAME functions the live app uses
 * (predictSoftSensor via classifyStation's building blocks, and
 * estimateSecondsToEmpty from src/engine/inference/bufferRisk.ts) against a
 * full offline trace — this is a measurement of the shipped code, not a
 * reimplementation of it.
 *
 * Usage: npx tsx src/engine/measureDemoScenario.ts
 */
import { buildGroundTruthStream } from './signals/groundTruth';
import { deriveObservableStream } from './signals/observable';
import { VisitTracker } from './inference/liveVisits';
import { buildFeatureVector } from './inference/liveFeatures';
import { predictSoftSensor, CONFIDENCE_FLOOR } from './inference/softSensor';
import { estimateSecondsToEmpty, BUFFER_SMOOTHING_WINDOW } from './inference/bufferRisk';
import {
  resolveConfidenceRegimeSequence,
  countFlips,
  DEFAULT_HYSTERESIS_CONFIG,
  NO_HYSTERESIS_CONFIG,
} from './inference/confidenceHysteresis';
import { STATIONS, STATIONS_BY_ID, TAKT_SECONDS } from './stations';
import { ALERT_MULTIPLIER } from './assumptions';
import { classifyStation, type StationDisplayState } from './inference/stationDisplay';
import { TRIM_CHASSIS_BUFFER } from './topology';
import {
  DEMO_DURATION_SECONDS,
  DEMO_INCIDENT,
  DEMO_JITTER_FRACTION,
  DEMO_SEED,
  PLAYBACK_MULTIPLE,
  PLAYBACK_TICKS_PER_STEP,
} from './demoScenario';

const STATION_INDEX = new Map(STATIONS.map((s, i) => [s.id, i]));
const STATION_ORDER = STATIONS.map((s) => s.id);
const BLIND_IDS = STATIONS.filter((s) => s.tier === 'blind').map((s) => s.id);

interface Sample {
  /** The visit's own entryTick — when S6 (say) started processing this
   *  vehicle. NOT when this prediction becomes available; kept for
   *  reference (e.g. "which vehicle") but never for "when did this fire". */
  entryTick: number;
  /** The tick at which this visit's prediction actually becomes computable
   *  by a live system: max(target's own exit, downstream's exit) — the
   *  downstream neighbour's dwell is one of the model's own features, so
   *  the prediction cannot exist before that visit has itself completed.
   *  This, not entryTick, is the correct axis for "when did the alert/tile
   *  commit" — conflating the two was a bug in an earlier version of this
   *  script's debounce measurement (see debouncedFirstCrossing's comment). */
  availableTick: number;
  cycleSeconds: number;
  confidence: number;
}

function neighbourIds(stationId: string): { upstreamId: string; downstreamId: string } {
  const idx = STATION_INDEX.get(stationId)!;
  return { upstreamId: STATION_ORDER[idx - 1], downstreamId: STATION_ORDER[idx + 1] };
}

/** Every inferable visit's prediction for one station, in order, each
 *  tagged with the tick it actually becomes available live. */
function samplesFor(tracker: VisitTracker, stationId: string): Sample[] {
  const { upstreamId, downstreamId } = neighbourIds(stationId);
  const stationSpec = STATIONS[STATION_INDEX.get(stationId)!];
  const stationIdx = STATION_INDEX.get(stationId)!;
  const samples: Sample[] = [];
  for (const visit of tracker.completedVisits(stationId)) {
    const downstream = tracker.completedForVehicle(downstreamId, visit.vehicleId);
    if (!downstream) continue;
    const upstream = tracker.completedForVehicle(upstreamId, visit.vehicleId);
    if (!upstream) continue;
    const prediction = predictSoftSensor(
      buildFeatureVector(stationSpec, stationIdx, visit, upstream, downstream),
    );
    samples.push({
      entryTick: visit.entryTick,
      availableTick: Math.max(visit.exitTick, downstream.exitTick),
      cycleSeconds: prediction.cycleTimeSeconds,
      confidence: prediction.confidence,
    });
  }
  return samples;
}

function stats(values: number[]) {
  const n = values.length;
  if (n === 0) return { n, mean: NaN, median: NaN, min: NaN, max: NaN, belowFloorPct: NaN };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const median = sorted[Math.floor(n / 2)];
  const belowFloor = values.filter((v) => v < CONFIDENCE_FLOOR).length;
  return { n, mean, median, min: sorted[0], max: sorted[n - 1], belowFloorPct: (100 * belowFloor) / n };
}

/** Same algorithm as estimateSecondsToEmpty, parameterized by window size,
 *  for sweeping window sizes against real data (see the window sweep
 *  below) rather than hardcoding the shipped BUFFER_SMOOTHING_WINDOW. */
function estimateSecondsToEmptyWithWindow(
  history: readonly number[],
  secondsPerSample: number,
  windowSize: number,
): number | null {
  if (history.length < windowSize) return null;
  const window = history.slice(-windowSize);
  const first = window[0];
  const last = window[window.length - 1];
  const drop = first - last;
  if (drop <= 1e-9) return null;
  const secondsElapsed = (window.length - 1) * secondsPerSample;
  const dropPerSecond = drop / secondsElapsed;
  return last / dropPerSecond;
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function main() {
  console.log('=== Demo scenario ===');
  console.log(
    `seed=${DEMO_SEED} jitter=${DEMO_JITTER_FRACTION} duration=${DEMO_DURATION_SECONDS}s ` +
      `incident=${JSON.stringify(DEMO_INCIDENT)} playbackMultiple=${PLAYBACK_MULTIPLE}x`,
  );

  const gt = buildGroundTruthStream({
    durationSeconds: DEMO_DURATION_SECONDS,
    seed: DEMO_SEED,
    jitterFraction: DEMO_JITTER_FRACTION,
    incidents: [DEMO_INCIDENT],
  });
  const obs = deriveObservableStream(gt);

  const tracker = new VisitTracker();
  const trimHistoryAtStep: number[] = [];
  let trueDrainOnsetTick: number | null = null;
  let trueDrainZeroTick: number | null = null;
  let wasAboveZero = true;

  for (const tick of obs) {
    tracker.applyTick(tick);

    const level = tracker.bufferLevels[TRIM_CHASSIS_BUFFER.id] ?? TRIM_CHASSIS_BUFFER.nominalFill;
    if (tick.tick >= DEMO_INCIDENT.atTick && trueDrainOnsetTick === null && level < TRIM_CHASSIS_BUFFER.nominalFill - 1e-6) {
      trueDrainOnsetTick = tick.tick;
    }
    const isZero = level <= 1e-9;
    if (isZero && wasAboveZero && trueDrainZeroTick === null) trueDrainZeroTick = tick.tick;
    wasAboveZero = !isZero;

    // Sample at the same cadence the live UI samples at (once per playback step).
    if (tick.tick % PLAYBACK_TICKS_PER_STEP === 0) trimHistoryAtStep.push(level);
  }

  // --- 1. Confidence: S6 rest + incident trajectory, other blind stations' rest ---
  console.log('\n=== Blind-station calibrated confidence (rest = before incident onset) ===');
  for (const stationId of BLIND_IDS) {
    const samples = samplesFor(tracker, stationId);
    const rest = samples.filter((s) => s.entryTick < DEMO_INCIDENT.atTick).map((s) => s.confidence);
    const s = stats(rest);
    console.log(
      `${stationId}: rest n=${s.n} mean=${fmtPct(s.mean)} median=${fmtPct(s.median)} ` +
        `min=${fmtPct(s.min)} max=${fmtPct(s.max)} belowFloor(${fmtPct(CONFIDENCE_FLOOR)})=${s.belowFloorPct.toFixed(0)}%`,
    );
  }

  console.log(`\n=== S6 trajectory: onset at tick ${DEMO_INCIDENT.atTick}, degraded to ${DEMO_INCIDENT.newCycleSeconds}s ===`);
  const s6Samples = samplesFor(tracker, 'S6');
  const s6Incident = s6Samples.filter((s) => s.entryTick >= DEMO_INCIDENT.atTick);
  let peak = s6Incident[0];
  for (const s of s6Incident) if (s.confidence > peak.confidence) peak = s;
  console.log(`visits after onset: ${s6Incident.length}`);
  console.log('entryTick | availableTick (+after onset) | predicted cycle | confidence');
  for (const s of s6Incident) {
    console.log(
      `  ${s.entryTick} | ${s.availableTick} (+${s.availableTick - DEMO_INCIDENT.atTick}s) | ${s.cycleSeconds.toFixed(1)}s | ${fmtPct(s.confidence)}`,
    );
  }
  console.log(
    `PEAK: entryTick ${peak.entryTick}, available at +${peak.availableTick - DEMO_INCIDENT.atTick}s after onset, predicted ${peak.cycleSeconds.toFixed(1)}s, confidence ${fmtPct(peak.confidence)}`,
  );

  // --- Well-powered rest distribution: separate long no-incident run ---
  console.log('\n=== Rest confidence, full-shift no-incident run (well-powered) ===');
  const gtRest = buildGroundTruthStream({
    durationSeconds: DEMO_DURATION_SECONDS,
    seed: DEMO_SEED,
    jitterFraction: DEMO_JITTER_FRACTION,
    incidents: [],
  });
  const obsRest = deriveObservableStream(gtRest);
  const restTracker = new VisitTracker();
  for (const tick of obsRest) restTracker.applyTick(tick);
  for (const stationId of BLIND_IDS) {
    const samples = samplesFor(restTracker, stationId);
    const confidences = samples.map((s) => s.confidence);
    const s = stats(confidences);
    console.log(
      `${stationId}: n=${s.n} mean=${fmtPct(s.mean)} median=${fmtPct(s.median)} min=${fmtPct(s.min)} ` +
        `max=${fmtPct(s.max)} belowFloor(${fmtPct(CONFIDENCE_FLOOR)})=${s.belowFloorPct.toFixed(0)}%`,
    );
  }
  console.log('\nS6 full-shift confidence sequence (no incident):');
  console.log(
    samplesFor(restTracker, 'S6')
      .map((s) => fmtPct(s.confidence))
      .join(', '),
  );

  // --- 2. Hysteresis: flip counts before vs after, on REAL measured data ---
  console.log('\n=== Flicker: state flips per steady-state minute, before vs after hysteresis ===');
  console.log(`config: floor=${DEFAULT_HYSTERESIS_CONFIG.floor} margin=${DEFAULT_HYSTERESIS_CONFIG.margin} minHold=${DEFAULT_HYSTERESIS_CONFIG.minHold}`);
  for (const stationId of BLIND_IDS) {
    const samples = samplesFor(restTracker, stationId);
    if (samples.length < 2) {
      console.log(`${stationId}: insufficient rest samples (n=${samples.length}) to measure flip rate`);
      continue;
    }
    const confidences = samples.map((s) => s.confidence);
    const spanSeconds = samples[samples.length - 1].availableTick - samples[0].availableTick;
    const spanMinutes = spanSeconds / 60;

    const before = countFlips(resolveConfidenceRegimeSequence(confidences, NO_HYSTERESIS_CONFIG));
    const after = countFlips(resolveConfidenceRegimeSequence(confidences, DEFAULT_HYSTERESIS_CONFIG));

    console.log(
      `${stationId}: rest span=${spanMinutes.toFixed(1)}min, n=${samples.length} visits — ` +
        `flips before=${before} (${(before / spanMinutes).toFixed(2)}/min) | ` +
        `after=${after} (${(after / spanMinutes).toFixed(2)}/min)`,
    );
  }

  console.log('\nS6, FULL continuous sequence (pre-onset rest + post-onset incident, exactly as the live classifier sees it) — flip check:');
  {
    // Must use the full pre+post sequence, not just the post-onset slice:
    // the live classifier (stationDisplay.ts) always passes the station's
    // ENTIRE inferable-visit history to resolveConfidenceRegime, so the
    // hysteresis state carries over from rest into the incident rather than
    // "bootstrapping" fresh right at onset.
    const confidences = s6Samples.map((s) => s.confidence);
    const onsetIdx = s6Samples.findIndex((s) => s.entryTick >= DEMO_INCIDENT.atTick);
    const before = resolveConfidenceRegimeSequence(confidences, NO_HYSTERESIS_CONFIG);
    const after = resolveConfidenceRegimeSequence(confidences, DEFAULT_HYSTERESIS_CONFIG);

    const restFlipsBefore = countFlips(before.slice(0, onsetIdx));
    const restFlipsAfter = countFlips(after.slice(0, onsetIdx));
    console.log(`pre-onset (rest) portion: ${onsetIdx} visits, flips before=${restFlipsBefore}, after=${restFlipsAfter}`);

    const postOnsetBefore = before.slice(onsetIdx);
    const postOnsetAfter = after.slice(onsetIdx);
    console.log(`post-onset (incident) portion: ${postOnsetBefore.length} visits`);
    console.log(`  before (no hysteresis): ${postOnsetBefore.join(' -> ')}`);
    console.log(`  before flip count (post-onset): ${countFlips(postOnsetBefore)}`);
    console.log(`  after (hysteresis):     ${postOnsetAfter.join(' -> ')}`);
    console.log(`  after flip count (post-onset): ${countFlips(postOnsetAfter)}`);

    const firstInferredIdx = after.findIndex((r, i) => i >= onsetIdx && r === 'inferred');
    if (firstInferredIdx >= 0) {
      console.log(
        `after: regime at onset was '${after[onsetIdx - 1] ?? 'n/a (no pre-onset data)'}'; ` +
          `commits to Inferred when available at tick ${s6Samples[firstInferredIdx].availableTick} ` +
          `(+${s6Samples[firstInferredIdx].availableTick - DEMO_INCIDENT.atTick}s after onset), and does not revert for the remaining ${
            after.length - 1 - firstInferredIdx
          } visits of this run`,
      );
    }
  }

  // --- Cycle-time-based alert signal: false-alarm risk at rest, detection
  // speed during the incident, at various debounce (minHold) levels ---
  console.log('\n=== Cycle-time alert signal (decoupled from confidence) ===');
  const nominal = TAKT_SECONDS;
  const threshold = nominal * ALERT_MULTIPLIER;
  console.log(`threshold = nominal(${nominal}) * ALERT_MULTIPLIER(${ALERT_MULTIPLIER}) = ${threshold.toFixed(1)}s`);

  // Returns the index of the visit at which a LIVE system would actually
  // commit to "alert active" — the run-completing sample, not its start.
  // (A first version of this returned i - minHold + 1, the start of the
  // run — wrong: at that point a live system has only seen ONE crossing
  // and cannot yet know a second is coming. Caught by cross-checking
  // against classifyStation's own output directly, which disagreed with
  // this function's original "+45s" claim.)
  function debouncedFirstCrossing(values: number[], minHold: number): number | null {
    let run = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] >= threshold) {
        run++;
        if (run >= minHold) return i;
      } else {
        run = 0;
      }
    }
    return null;
  }

  console.log('\nRest false-alarm check (all 6 blind stations, well-powered no-incident run):');
  for (const stationId of BLIND_IDS) {
    const cycleSeq = samplesFor(restTracker, stationId).map((s) => s.cycleSeconds);
    const crossings = cycleSeq.filter((v) => v >= threshold).length;
    let longestRun = 0;
    let run = 0;
    for (const v of cycleSeq) {
      run = v >= threshold ? run + 1 : 0;
      longestRun = Math.max(longestRun, run);
    }
    console.log(
      `${stationId}: n=${cycleSeq.length} visits, ${crossings} cross threshold in isolation, longest consecutive run=${longestRun}`,
    );
  }

  console.log('\nS6 incident: first alert commit at various debounce levels (full continuous sequence, pre+post onset):');
  console.log('(availableTick, not entryTick — the tick a live system actually has this prediction, per Sample\'s comment)');
  const s6CycleFull = s6Samples.map((s) => s.cycleSeconds);
  const onsetIdxCycle = s6Samples.findIndex((s) => s.entryTick >= DEMO_INCIDENT.atTick);
  for (const minHold of [1, 2, 3]) {
    const idx = debouncedFirstCrossing(s6CycleFull, minHold);
    if (idx === null) {
      console.log(`  minHold=${minHold}: never fires`);
    } else if (idx < onsetIdxCycle) {
      console.log(`  minHold=${minHold}: FALSE ALARM before onset, available at tick ${s6Samples[idx].availableTick}`);
    } else {
      console.log(
        `  minHold=${minHold}: commits when available at tick ${s6Samples[idx].availableTick} (+${s6Samples[idx].availableTick - DEMO_INCIDENT.atTick}s after onset)`,
      );
    }
  }

  // --- Authoritative one-axis timeline: replay the ACTUAL live classifier
  // (classifyStation) tick-by-tick, exactly as useEngineTwin.ts's playback
  // loop does, rather than reconstructing its behaviour by hand from
  // separately-computed sequences (which is how an earlier version of this
  // script got the alert-commit tick wrong — see debouncedFirstCrossing's
  // comment). This is ground truth for what the browser actually shows. ---
  console.log('\n=== ONE-AXIS TIMELINE (all times in seconds after S6 incident onset) ===');
  {
    const replayTracker = new VisitTracker();
    let restState: StationDisplayState | null = null;
    let degradingCommitTick: number | null = null;
    let prevKind: string | null = null;

    for (const tickData of obs) {
      replayTracker.applyTick(tickData);
      const state = classifyStation(STATIONS_BY_ID['S6'], replayTracker);

      if (tickData.tick === DEMO_INCIDENT.atTick - 1) restState = state;

      if (degradingCommitTick === null && state.kind === 'degrading' && prevKind !== 'degrading') {
        degradingCommitTick = tickData.tick;
      }
      prevKind = state.kind;
    }

    console.log(`(d) S6 rests stably in: '${restState?.kind}' the tick before onset (tick ${DEMO_INCIDENT.atTick - 1})`);
    console.log(
      `(b) S6 tile first commits to Degrading at tick ${degradingCommitTick} ` +
        `(+${degradingCommitTick !== null ? degradingCommitTick - DEMO_INCIDENT.atTick : 'n/a'}s after onset) ` +
        `— recommendation fires at the same tick, since computeRecommendation triggers directly off kind==='degrading'`,
    );
    if (trueDrainZeroTick !== null) {
      console.log(`(c) S9 starves (buffer hits zero) at tick ${trueDrainZeroTick} (+${trueDrainZeroTick - DEMO_INCIDENT.atTick}s after onset)`);
      if (degradingCommitTick !== null) {
        console.log(
          `    => on-screen lead time (starvation - tile commit): ${trueDrainZeroTick - degradingCommitTick}s`,
        );
      }
    }
  }

  // --- 3. Buffer ETA accuracy ---
  console.log('\n=== Trim-to-chassis buffer: true drain vs live-UI displayed ETA ===');
  console.log(`nominal fill: ${TRIM_CHASSIS_BUFFER.nominalFill}, capacity: ${TRIM_CHASSIS_BUFFER.capacity}`);
  console.log(`true onset of drain (tick level first drops below nominal): ${trueDrainOnsetTick}`);
  console.log(`true tick buffer first reaches zero: ${trueDrainZeroTick}`);
  if (trueDrainOnsetTick !== null && trueDrainZeroTick !== null) {
    console.log(`true drain duration: ${trueDrainZeroTick - trueDrainOnsetTick}s (docs/assumptions.md's derivation: ~415s / ~7min)`);
  }

  console.log('\nWhat the live UI would have displayed, sampled every playback step:');
  console.log(`(smoothing window = ${BUFFER_SMOOTHING_WINDOW} samples = ${BUFFER_SMOOTHING_WINDOW * PLAYBACK_TICKS_PER_STEP}s of sim time)`);
  console.log('step# | simTick | level | displayed ETA | true remaining (hindsight)');
  const incidentStepIndex = Math.floor(DEMO_INCIDENT.atTick / PLAYBACK_TICKS_PER_STEP);
  for (let i = Math.max(0, incidentStepIndex - 2); i < Math.min(trimHistoryAtStep.length, incidentStepIndex + 16); i++) {
    const simTick = i * PLAYBACK_TICKS_PER_STEP;
    const windowSoFar = trimHistoryAtStep.slice(0, i + 1);
    const eta = estimateSecondsToEmpty(windowSoFar, PLAYBACK_TICKS_PER_STEP);
    const trueRemaining = trueDrainZeroTick !== null ? Math.max(0, trueDrainZeroTick - simTick) : null;
    console.log(
      `${i} | ${simTick} | ${trimHistoryAtStep[i].toFixed(3)} | ${eta === null ? 'stable/n-a' : eta.toFixed(0) + 's'} | ${
        trueRemaining === null ? 'n/a' : trueRemaining + 's'
      }`,
    );
  }

  // --- 3b. Does a shorter smoothing window track the real drain better,
  // without reintroducing the original noise-driven false-alarm bug at rest? ---
  console.log('\n=== Smoothing-window sweep: rest false-alarm risk vs incident tracking speed ===');
  const restHistoryAtStep: number[] = [];
  {
    const sweepTracker = new VisitTracker();
    for (const tick of obsRest) {
      sweepTracker.applyTick(tick);
      if (tick.tick % PLAYBACK_TICKS_PER_STEP === 0) {
        restHistoryAtStep.push(sweepTracker.bufferLevels[TRIM_CHASSIS_BUFFER.id] ?? TRIM_CHASSIS_BUFFER.nominalFill);
      }
    }
  }
  for (const windowSize of [2, 3, 4, 5, 6, 8, 10]) {
    // Rest: does this window EVER produce a non-null (i.e. "draining") ETA
    // at genuine steady state? Worst-case (smallest, most alarming) value.
    let worstRestEta: number | null = null;
    for (let i = windowSize; i <= restHistoryAtStep.length; i++) {
      const eta = estimateSecondsToEmptyWithWindow(restHistoryAtStep.slice(0, i), PLAYBACK_TICKS_PER_STEP, windowSize);
      if (eta !== null && (worstRestEta === null || eta < worstRestEta)) worstRestEta = eta;
    }

    // Incident: first step where the displayed ETA is within 2x of the true
    // remaining time (a supervisor-usable estimate), and how many seconds
    // after onset that is.
    let firstUsableStep: number | null = null;
    for (let i = incidentStepIndex; i < trimHistoryAtStep.length; i++) {
      const eta = estimateSecondsToEmptyWithWindow(trimHistoryAtStep.slice(0, i + 1), PLAYBACK_TICKS_PER_STEP, windowSize);
      const simTick = i * PLAYBACK_TICKS_PER_STEP;
      const trueRemaining = trueDrainZeroTick !== null ? trueDrainZeroTick - simTick : null;
      if (eta !== null && trueRemaining !== null && trueRemaining > 0 && eta <= trueRemaining * 2 && eta >= trueRemaining * 0.5) {
        firstUsableStep = simTick - DEMO_INCIDENT.atTick;
        break;
      }
    }

    console.log(
      `window=${windowSize} (${windowSize * PLAYBACK_TICKS_PER_STEP}s): ` +
        `rest worst-case false-alarm ETA=${worstRestEta === null ? 'none (never drains)' : worstRestEta.toFixed(0) + 's'} | ` +
        `incident: first usable (within 2x true) estimate at +${firstUsableStep === null ? 'never' : firstUsableStep + 's'} after onset`,
    );
  }

  // --- 4. Wall-clock timing ---
  console.log('\n=== Wall-clock timing at current playback multiple ===');
  console.log(`playback multiple: ${PLAYBACK_MULTIPLE}x`);
  console.log(`wall-clock to reach incident onset (tick ${DEMO_INCIDENT.atTick}): ${(DEMO_INCIDENT.atTick / PLAYBACK_MULTIPLE).toFixed(1)}s`);
  if (trueDrainOnsetTick !== null && trueDrainZeroTick !== null) {
    const drainSimSeconds = trueDrainZeroTick - trueDrainOnsetTick;
    console.log(`wall-clock for the drain arc (onset of drop to zero): ${(drainSimSeconds / PLAYBACK_MULTIPLE).toFixed(2)}s`);
  }
  console.log(`wall-clock for the full ${DEMO_DURATION_SECONDS}s demo shift: ${(DEMO_DURATION_SECONDS / PLAYBACK_MULTIPLE).toFixed(1)}s`);
  console.log(`(for reference, TAKT_SECONDS=${TAKT_SECONDS}s)`);
}

main();
