import { useEffect, useRef, useState } from 'react';
import type { Station, StationState } from '@/types';
import {
  BUFFER_MID,
  RATE_INCIDENT_JPH,
  RATE_REST_JPH,
  S6_CONFIDENCE_INCIDENT,
  S6_CONFIDENCE_REST,
  S6_CYCLE_INCIDENT,
  STARVE_MINUTES,
  CARS_AT_RISK,
  steadyStations,
  nowTime,
  INCIDENT_SAMPLES,
  REST_SAMPLES,
} from '@/model';
import type { TwinPhase, EventLine, PredictionState, RecommendationState } from '@/types';

type State = {
  phase: TwinPhase;
  stations: Station[];
  /** buffer fills 0..100 between adjacent stations, length 9 */
  bufferFills: number[];
  bufferLevels: ('normal' | 'filling' | 'draining')[];
  rateJph: number;
  ftt: number;
  s6Confidence: number;
  s6Cycle: number;
  incidentPill: 'LIVE' | 'INCIDENT';
  rippleActive: boolean;
  rippleStations: StationState[]; // per-station overlay
  events: EventLine[];
  prediction: PredictionState;
  recommendation: RecommendationState;
  runningIncident: boolean;
};

const REST_PREDICTION: PredictionState = {
  active: false,
  headline: 'No ripple predicted',
  minutesToStarve: null,
  carsAtRisk: null,
  samples: REST_SAMPLES,
};

const REST_RECO: RecommendationState = {
  actions: [],
  note: 'Stratify never stops the line. A person decides.',
};

const STEADY_EVENT: EventLine = {
  id: 0,
  time: nowTime(),
  text: 'Line nominal. All stations within takt.',
  kind: 'info',
};

function initialState(): State {
  return {
    phase: 'connecting',
    stations: steadyStations(),
    bufferFills: Array(9).fill(BUFFER_MID),
    bufferLevels: Array(9).fill('normal'),
    rateJph: RATE_REST_JPH,
    ftt: 96.2,
    s6Confidence: S6_CONFIDENCE_REST,
    s6Cycle: 55,
    incidentPill: 'LIVE',
    rippleActive: false,
    rippleStations: Array(10).fill('running'),
    events: [],
    prediction: { ...REST_PREDICTION },
    recommendation: { ...REST_RECO },
    runningIncident: false,
  };
}

export function useTwinState() {
  const [state, setState] = useState<State>(initialState);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const eventId = useRef(1);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    return clearTimers;
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
  };

  const pushEvent = (
    prev: State,
    text: string,
    kind: EventLine['kind'],
  ): EventLine[] => {
    const e: EventLine = { id: eventId.current++, time: nowTime(), text, kind };
    return [...prev.events, e];
  };

  /** Finish connecting -> steady state. */
  const connect = () => {
    setState((s) => ({
      ...s,
      phase: 'steady',
      events: [{ ...STEADY_EVENT, id: eventId.current++, time: nowTime() }],
    }));
  };

  /** Reset back to steady state. */
  const reset = () => {
    clearTimers();
    eventId.current = 1;
    setState({
      ...initialState(),
      phase: 'steady',
      events: [{ ...STEADY_EVENT, id: eventId.current++, time: nowTime() }],
    });
  };

  /** Run the incident sequence. */
  const runIncident = () => {
    setState((s) => {
      if (s.runningIncident) return s;
      return { ...s, runningIncident: true };
    });

    clearTimers();
    eventId.current = 1;

    // t=0: incident pill, rate drop, B5 fills amber, B6 drains red, S6 cycle -> 80, conf 72->86, S6 slowing
    schedule(() => {
      setState((s) => {
        const fills = [...s.bufferFills];
        const levels = [...s.bufferLevels] as State['bufferLevels'];
        // B5 is index 4 (between S5 and S6) -> fills amber
        fills[4] = 88;
        levels[4] = 'filling';
        // B6 is index 5 (between S6 and S7) -> drains red
        fills[5] = 12;
        levels[5] = 'draining';

        const stations = s.stations.map((st) =>
          st.id === 'S6'
            ? { ...st, cycle: S6_CYCLE_INCIDENT, state: 'slowing' as StationState }
            : st,
        );

        return {
          ...s,
          phase: 'incident',
          stations,
          bufferFills: fills,
          bufferLevels: levels,
          rateJph: RATE_INCIDENT_JPH,
          ftt: 94.8,
          s6Cycle: S6_CYCLE_INCIDENT,
          s6Confidence: S6_CONFIDENCE_INCIDENT,
          incidentPill: 'INCIDENT',
          events: pushEvent(s, 'S6 Seats has no telemetry. State estimated from neighbours.', 'info'),
        };
      });
    }, 0);

    // t=800ms: upstream WIP rising
    schedule(() => {
      setState((s) => ({
        ...s,
        events: pushEvent(s, 'Upstream WIP rising at B5. Soft-sensor flags S6 slowdown.', 'warn'),
      }));
    }, 800);

    // t=1600ms: downstream starving, S6 cycle inferred ~80s
    schedule(() => {
      setState((s) => ({
        ...s,
        events: pushEvent(
          s,
          'Downstream B6 starving. S6 cycle inferred at ~80s, was 55s.',
          'warn',
        ),
      }));
    }, 1600);

    // t=2200ms: ripple predicted -> S9, prediction panel fills
    schedule(() => {
      setState((s) => ({
        ...s,
        rippleActive: true,
        rippleStations: ['running', 'running', 'running', 'running', 'running', 'slowing', 'running', 'running', 'starved', 'running'],
        prediction: {
          active: true,
          headline: `S9 Fluids runs out of parts in ~${STARVE_MINUTES} min, ~${CARS_AT_RISK} cars at risk this shift`,
          minutesToStarve: STARVE_MINUTES,
          carsAtRisk: CARS_AT_RISK,
          samples: INCIDENT_SAMPLES,
        },
        events: pushEvent(
          s,
          `Ripple predicted: S9 Fluids runs dry in ~${STARVE_MINUTES} min. ~${CARS_AT_RISK} cars at risk.`,
          'crit',
        ),
      }));
    }, 2200);

    // t=3000ms: ripple highlight S7
    schedule(() => {
      setState((s) => ({
        ...s,
        rippleStations: ['running', 'running', 'running', 'running', 'running', 'slowing', 'slowing', 'running', 'starved', 'running'],
      }));
    }, 3000);

    // t=3600ms: ripple highlight S8
    schedule(() => {
      setState((s) => ({
        ...s,
        rippleStations: ['running', 'running', 'running', 'running', 'running', 'slowing', 'slowing', 'slowing', 'starved', 'running'],
      }));
    }, 3600);

    // t=4200ms: torque drift on S2
    schedule(() => {
      setState((s) => {
        const stations = s.stations.map((st) =>
          st.id === 'S2' ? { ...st, qualityFlag: 'TORQUE DRIFT' } : st,
        );
        return {
          ...s,
          stations,
          events: pushEvent(
            s,
            'Torque drift at S2 Cockpit. Flagged at source, would surface at EOL after ~30 cars.',
            'warn',
          ),
        };
      });
    }, 4200);

    // t=5000ms: recommendation fills in
    schedule(() => {
      setState((s) => ({
        ...s,
        recommendation: {
          actions: [
            'Move one operator from S5 to S6 Seats',
            'Add a cycle sensor at S6 to raise confidence 86% to 97%',
          ],
          note: 'Stratify never stops the line. A person decides.',
        },
        events: pushEvent(
          s,
          'Recommend: move one operator to S6. Add cycle sensor at S6.',
          'info',
        ),
        runningIncident: false,
      }));
    }, 5000);
  };

  return { state, connect, reset, runIncident };
}
