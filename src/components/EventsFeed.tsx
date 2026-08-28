import { PanelTitle } from './ConfidenceRing';
import type { EventLine } from '@/types';

interface Props {
  events: EventLine[];
}

const KIND_DOT: Record<EventLine['kind'], string> = {
  info: 'bg-cyan',
  warn: 'bg-slowing',
  crit: 'bg-starved',
};

export function EventsFeed({ events }: Props) {
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Events Feed" subtitle="Live" />
      <div className="thin-scroll flex-1 overflow-y-auto px-4 py-3">
        {events.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-[11px] text-ink-muted">— no events —</span>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {events.map((e) => (
              <li key={e.id} className="flex animate-riseIn items-start gap-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} />
                <div className="flex flex-col">
                  <span className="font-mono text-[9.5px] tabular-nums text-ink-secondary">
                    {e.time}
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
