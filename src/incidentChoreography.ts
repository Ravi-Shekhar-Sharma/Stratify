import { useEffect, useRef, useState } from 'react';
import type { EnginePhase } from '@/twinTypes';

export type ChoreographyAct = 'idle' | 'focus' | 'ripple' | 'reveal' | 'settle';

/**
 * Directs the viewer's eye through the incident instead of just flipping
 * states: focus on the degrading station (everything else dims) -> a
 * ripple travels downstream to the buffer -> the buffer/recommendation get
 * their reveal beat -> settle back to ordinary live monitoring. Timed on a
 * fixed wall-clock schedule, not the sim clock — this is staging the
 * viewer's attention, not simulating anything, and it lines up with the
 * documented ~9.5s wall-clock length of the demo incident's rest-to-
 * starvation arc at the shipped ×50 playback (engine/demoScenario.ts).
 * Fires once per incident onset; never replays while phase stays 'incident'.
 */
export function useIncidentChoreography(phase: EnginePhase): ChoreographyAct {
  const [act, setAct] = useState<ChoreographyAct>('idle');
  const running = useRef(false);

  useEffect(() => {
    if (phase === 'incident' && !running.current) {
      running.current = true;
      setAct('focus');
      const timers = [
        setTimeout(() => setAct('ripple'), 1400),
        setTimeout(() => setAct('reveal'), 3600),
        setTimeout(() => setAct('settle'), 7800),
      ];
      return () => timers.forEach(clearTimeout);
    }
    if (phase !== 'incident') {
      running.current = false;
      setAct('idle');
    }
  }, [phase]);

  return act;
}
