import { useCallback, useEffect, useRef, useState } from 'react';
import { buildGroundTruthStream } from '@/engine/signals/groundTruth';
import { deriveObservableStream, type ObservableStream } from '@/engine/signals/observable';
import type { IncidentInjection } from '@/engine/simulation';
import { VisitTracker } from '@/engine/inference/liveVisits';
import { classifyStation } from '@/engine/inference/stationDisplay';
import { STATIONS, TAKT_SECONDS } from '@/engine/stations';
import { PAINTED_BODY_STORE, TRIM_CHASSIS_BUFFER } from '@/engine/topology';
import { CONFIDENCE_CEILING } from '@/engine/inference/softSensor';
import { estimateSecondsToEmpty } from '@/engine/inference/bufferRisk';
import {
  DEMO_DURATION_SECONDS,
  DEMO_INCIDENT,
  DEMO_JITTER_FRACTION,
  DEMO_SEED,
  PLAYBACK_INTERVAL_MS,
  PLAYBACK_MULTIPLE,
  PLAYBACK_TICKS_PER_STEP,
} from '@/engine/demoScenario';
import type {
  BufferViewModel,
  EnginePhase,
  EventLine,
  Recommendation,
  StationViewModel,
  TwinSnapshot,
} from '@/twinTypes';

const THROUGHPUT_WINDOW_SECONDS = 900; // trailing 15 simulated minutes
const LAST_STATION_ID = STATIONS[STATIONS.length - 1].id;

function buildStream(incidents: IncidentInjection[]): ObservableStream {
  const gt = buildGroundTruthStream({
    durationSeconds: DEMO_DURATION_SECONDS,
    seed: DEMO_SEED,
    jitterFraction: DEMO_JITTER_FRACTION,
    incidents,
  });
  return deriveObservableStream(gt);
}

function computeThroughputJph(tracker: VisitTracker): number {
  const completions = tracker.completedVisits(LAST_STATION_ID);
  const windowStart = tracker.currentTick - THROUGHPUT_WINDOW_SECONDS;
  let count = 0;
  for (let i = completions.length - 1; i >= 0; i--) {
    if (completions[i].exitTick < windowStart) break;
    count++;
  }
  const windowSeconds = Math.min(tracker.currentTick + 1, THROUGHPUT_WINDOW_SECONDS);
  if (windowSeconds <= 0) return 0;
  return (count / windowSeconds) * 3600;
}

function bufferView(id: string, label: string, level: number, capacity: number, previous: number | undefined): BufferViewModel {
  const fillPct = Math.max(0, Math.min(100, (level / capacity) * 100));
  let trend: BufferViewModel['trend'] = 'normal';
  if (previous !== undefined) {
    if (level < previous - 1e-6) trend = 'draining';
    else if (level > previous + 1e-6) trend = 'filling';
  }
  return { id, label, fillPct, trend };
}

function computeRecommendation(stations: StationViewModel[]): Recommendation {
  let worstDegrading: StationViewModel | undefined;
  let worstRatio = 0;
  let firstAbstained: StationViewModel | undefined;

  for (const sv of stations) {
    if (sv.state.kind === 'degrading') {
      const ratio = sv.state.cycleSeconds / sv.spec.nominalCycleSeconds;
      if (ratio > worstRatio) {
        worstRatio = ratio;
        worstDegrading = sv;
      }
    } else if (sv.state.kind === 'abstained' && !firstAbstained) {
      firstAbstained = sv;
    }
  }

  if (worstDegrading && worstDegrading.state.kind === 'degrading') {
    const state = worstDegrading.state;
    return {
      kind: 'degrading',
      stationId: worstDegrading.spec.id,
      stationName: worstDegrading.spec.name,
      cycleSeconds: state.cycleSeconds,
      nominalCycleSeconds: worstDegrading.spec.nominalCycleSeconds,
      basis: state.basis,
      confidence: state.confidence,
      confidenceCeiling: CONFIDENCE_CEILING,
    };
  }

  if (firstAbstained && firstAbstained.state.kind === 'abstained') {
    return {
      kind: 'abstained',
      stationId: firstAbstained.spec.id,
      stationName: firstAbstained.spec.name,
      reason: firstAbstained.state.reason,
    };
  }

  return { kind: 'nominal' };
}

function formatEventLine(id: number, tick: number, text: string, kind: EventLine['kind']): EventLine {
  return { id, simTick: tick, text, kind };
}

export function useEngineTwin() {
  const [phase, setPhase] = useState<EnginePhase>('connecting');
  const [snapshot, setSnapshot] = useState<TwinSnapshot | null>(null);

  const streamRef = useRef<ObservableStream>([]);
  const trackerRef = useRef<VisitTracker>(new VisitTracker());
  const playheadRef = useRef(0);
  const incidentRef = useRef<IncidentInjection | null>(null);
  const prevKindRef = useRef<Map<string, string>>(new Map());
  const prevBufferRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventIdRef = useRef(1);
  const eventsRef = useRef<EventLine[]>([]);
  const trimHistoryRef = useRef<number[]>([]);

  const stopInterval = () => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const pushEvent = (text: string, kind: EventLine['kind']) => {
    eventsRef.current = [
      ...eventsRef.current,
      formatEventLine(eventIdRef.current++, playheadRef.current, text, kind),
    ].slice(-40);
  };

  const computeSnapshot = useCallback((): TwinSnapshot => {
    const tracker = trackerRef.current;
    const stations: StationViewModel[] = STATIONS.map((spec) => ({
      spec,
      state: classifyStation(spec, tracker),
    }));

    const paintedLevel = tracker.bufferLevels[PAINTED_BODY_STORE.id] ?? PAINTED_BODY_STORE.nominalFill;
    const trimLevel = tracker.bufferLevels[TRIM_CHASSIS_BUFFER.id] ?? TRIM_CHASSIS_BUFFER.nominalFill;
    const buffers = [
      bufferView(
        PAINTED_BODY_STORE.id,
        'Painted Body Store',
        paintedLevel,
        PAINTED_BODY_STORE.capacity,
        prevBufferRef.current.get(PAINTED_BODY_STORE.id),
      ),
      bufferView(
        TRIM_CHASSIS_BUFFER.id,
        'Trim → Chassis Buffer',
        trimLevel,
        TRIM_CHASSIS_BUFFER.capacity,
        prevBufferRef.current.get(TRIM_CHASSIS_BUFFER.id),
      ),
    ];
    prevBufferRef.current.set(PAINTED_BODY_STORE.id, paintedLevel);
    prevBufferRef.current.set(TRIM_CHASSIS_BUFFER.id, trimLevel);

    trimHistoryRef.current = [...trimHistoryRef.current, trimLevel].slice(-60);
    const trimBufferSecondsToEmpty = estimateSecondsToEmpty(trimHistoryRef.current, PLAYBACK_TICKS_PER_STEP);

    // Real transitions only: diff each station's classified kind against
    // last snapshot and log the ones that actually changed.
    for (const sv of stations) {
      const prevKind = prevKindRef.current.get(sv.spec.id);
      if (prevKind !== undefined && prevKind !== sv.state.kind) {
        if (sv.state.kind === 'degrading') {
          const conf = sv.state.basis === 'inferred' && sv.state.confidence !== undefined
            ? `, ${(sv.state.confidence * 100).toFixed(0)}% confidence`
            : '';
          pushEvent(
            `${sv.spec.id} ${sv.spec.name} degrading: ${sv.state.cycleSeconds.toFixed(0)}s vs ${sv.spec.nominalCycleSeconds}s nominal${conf}.`,
            'warn',
          );
        } else if (sv.state.kind === 'abstained') {
          pushEvent(`${sv.spec.id} ${sv.spec.name} abstaining: ${sv.state.reason}`, 'crit');
        } else if (sv.state.kind === 'measured' || sv.state.kind === 'inferred') {
          if (prevKind === 'degrading' || prevKind === 'abstained') {
            pushEvent(`${sv.spec.id} ${sv.spec.name} back within takt.`, 'info');
          }
        }
      }
      prevKindRef.current.set(sv.spec.id, sv.state.kind);
    }

    if (
      incidentRef.current &&
      playheadRef.current >= incidentRef.current.atTick &&
      playheadRef.current < incidentRef.current.atTick + PLAYBACK_TICKS_PER_STEP
    ) {
      pushEvent(
        `Incident injected: ${incidentRef.current.stationId} cycle time set to ${incidentRef.current.newCycleSeconds}s (was ${TAKT_SECONDS}s).`,
        'info',
      );
    }

    const nextPhase: EnginePhase =
      incidentRef.current && playheadRef.current >= incidentRef.current.atTick ? 'incident' : 'steady';

    return {
      phase: nextPhase,
      currentTick: playheadRef.current,
      totalTicks: streamRef.current.length,
      rateJph: computeThroughputJph(tracker),
      stations,
      buffers,
      trimBufferHistory: trimHistoryRef.current,
      trimBufferSecondsToEmpty,
      events: eventsRef.current,
      recommendation: computeRecommendation(stations),
      incidentScheduled: incidentRef.current !== null,
      playbackMultiple: PLAYBACK_MULTIPLE,
    };
  }, []);

  const startPlayback = useCallback(() => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      const stream = streamRef.current;
      const end = Math.min(playheadRef.current + PLAYBACK_TICKS_PER_STEP, stream.length);
      for (; playheadRef.current < end; playheadRef.current++) {
        trackerRef.current.applyTick(stream[playheadRef.current]);
      }
      setSnapshot(computeSnapshot());
      if (playheadRef.current >= stream.length - 1) stopInterval();
    }, PLAYBACK_INTERVAL_MS);
  }, [computeSnapshot]);

  const beginRun = useCallback(
    (incidents: IncidentInjection[]) => {
      stopInterval();
      streamRef.current = buildStream(incidents);
      trackerRef.current = new VisitTracker();
      playheadRef.current = 0;
      incidentRef.current = incidents[0] ?? null;
      prevKindRef.current = new Map();
      prevBufferRef.current = new Map();
      eventIdRef.current = 1;
      eventsRef.current = [];
      trimHistoryRef.current = [];
      setPhase('steady');
      setSnapshot(computeSnapshot());
      startPlayback();
    },
    [computeSnapshot, startPlayback],
  );

  useEffect(() => {
    beginRun([]);
    return stopInterval;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runIncident = useCallback(() => {
    beginRun([DEMO_INCIDENT]);
  }, [beginRun]);

  const reset = useCallback(() => {
    beginRun([]);
  }, [beginRun]);

  return { phase, snapshot, runIncident, reset };
}
