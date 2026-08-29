import { PanelTitle } from './PanelTitle';
import type { EventLine } from '@/twinTypes';

interface Props {
  events: EventLine[];
}

const KIND_DOT: Record<EventLine['kind'], string> = {
  info: 'bg-cyan',
  warn: 'bg-slowing',
  crit: 'bg-starved',
};

function formatTick(tick: number): string {
  const h = Math.floor(tick / 3600);
  const m = Math.floor((tick % 3600) / 60);
  const s = Math.floor(tick % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function EventsFeed({ events }: Props) {
  const ordered = [...events].reverse();
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Events Feed" subtitle="Live" />
      <div className="thin-scroll flex-1 overflow-y-auto px-4 py-3">
        {ordered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-[11px] text-ink-muted">— no events —</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {ordered.map((e) => (
              <li key={e.id} className="flex items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 ${KIND_DOT[e.kind]}`} />
                <div className="flex flex-col">
                  <span className="font-mono text-[9.5px] tabular-nums text-ink-secondary">
                    shift {formatTick(e.simTick)}
                  </span>
                  <span className="text-[12px] leading-snug text-ink-primary">{e.text}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
