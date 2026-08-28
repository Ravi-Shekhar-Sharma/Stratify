import type { Station, StationState } from '@/types';
import { useAnimatedNumber } from '@/useAnimatedNumber';

interface Props {
  station: Station;
  overlay?: StationState;
  active: boolean;
}

const STATE_DOT: Record<StationState, string> = {
  running: 'bg-measured',
  slowing: 'bg-slowing',
  starved: 'bg-starved',
  quality: 'bg-slowing',
};

const STATE_RING: Record<StationState, string> = {
  running: 'shadow-none',
  slowing: 'shadow-glowslowing',
  starved: 'shadow-glowstarved',
  quality: 'shadow-glowslowing',
};

export function StationCard({ station, overlay, active }: Props) {
  const state = overlay ?? station.state;
  const cycle = useAnimatedNumber(station.cycle, 500);
  const conf = useAnimatedNumber(station.confidence ?? 0, 600);

  const inferred = station.inferred;

  return (
    <div
      className={[
        'relative flex w-[120px] flex-col border bg-panel p-2.5 transition-colors duration-300',
        inferred ? 'border-dashed border-inferred/60' : 'border-line',
        active ? 'border-cyan ring-1 ring-cyan/40' : '',
      ]
        .join(' ')}
      style={{ borderRadius: 3 }}
      role="group"
      aria-label={`Station ${station.id} ${station.name}`}
    >
      {/* ripple sweep highlight */}
      {active && (
        <span className="pointer-events-none absolute inset-0 overflow-hidden" style={{ borderRadius: 3 }}>
          <span className="absolute top-0 h-full w-1/3 bg-cyan/10 animate-sweep" />
        </span>
      )}

      {/* top row: ID + state dot */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] font-bold tracking-wider text-ink-primary">
          {station.id}
        </span>
        <span
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            STATE_DOT[state]
          } ${STATE_RING[state]}`}
          aria-label={`state ${state}`}
        />
      </div>

      {/* name */}
      <div className="mt-1 text-[12.5px] font-semibold leading-tight text-ink-primary">
        {station.name}
      </div>

      {/* cycle time */}
      <div className="mt-2.5 flex items-baseline gap-1">
        <span className="font-mono text-[20px] font-bold tabular-nums text-ink-primary">
          {cycle.toFixed(0)}
        </span>
        <span className="text-[10px] font-medium text-ink-secondary">s</span>
      </div>

      {/* tag */}
      <div className="mt-2">
        <span
          className={`inline-block border px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.14em] ${
            inferred
              ? 'border-inferred/40 bg-inferred/10 text-inferred'
              : 'border-line bg-panel-raised text-ink-secondary'
          }`}
          style={{ borderRadius: 2 }}
        >
          {station.tag}
        </span>
      </div>

      {/* inferred extras */}
      {inferred && (
        <div className="mt-1.5 flex items-center gap-1">
          <span className="text-[8px] font-semibold uppercase tracking-wider text-ink-muted">
            NO SENSOR
          </span>
          <span className="ml-auto font-mono text-[10px] font-bold tabular-nums text-inferred">
            {conf.toFixed(0)}%
          </span>
        </div>
      )}

      {/* quality flag */}
      {station.qualityFlag && (
        <div
          className="mt-1.5 animate-riseIn border border-slowing/50 bg-slowing/10 px-1.5 py-0.5 text-[8.5px] font-bold tracking-[0.12em] text-slowing"
          style={{ borderRadius: 2 }}
        >
          {station.qualityFlag}
        </div>
      )}
    </div>
  );
}
