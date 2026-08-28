import type { Station, StationState } from '@/types';
import { STATION_ORDER } from '@/model';
import { StationCard } from './StationCard';
import { Buffer } from './Buffer';

interface Props {
  stations: Station[];
  bufferFills: number[];
  bufferLevels: ('normal' | 'filling' | 'draining')[];
  rippleStations: StationState[];
  rippleActive: boolean;
}

export function StationRow({
  stations,
  bufferFills,
  bufferLevels,
  rippleStations,
  rippleActive,
}: Props) {
  const byId = new Map(stations.map((s) => [s.id, s]));

  return (
    <div className="overflow-x-auto thin-scroll">
      <div className="flex min-w-max items-start gap-0 px-5 py-4">
        {STATION_ORDER.map((id, i) => {
          const st = byId.get(id);
          if (!st) return null;
          const overlay = rippleActive ? rippleStations[i] : undefined;
          const active =
            rippleActive &&
            (overlay === 'slowing' || overlay === 'starved') &&
            id !== 'S6';
          return (
            <div key={id} className="flex items-start">
              <StationCard station={st} overlay={overlay} active={active} />
              {i < STATION_ORDER.length - 1 && (
                <Buffer
                  id={`B${i + 1}`}
                  fill={bufferFills[i]}
                  level={bufferLevels[i]}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
