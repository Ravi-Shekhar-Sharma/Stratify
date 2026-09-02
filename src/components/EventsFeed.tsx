import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { STATE_TRANSITION } from '@/motion';
import type { EventLine } from '@/twinTypes';

interface Props {
  events: EventLine[];
  currentTick: number;
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

/** The engine writes one event per station (`S19 Underbody Fasteners
 *  abstaining: Confidence 56%, below the 60% floor. Not guessing.`) — real, but several
 *  blind stations hitting the same floor at once reads as three lines that
 *  say the same thing. Grouping is display-only: it collapses same-cause
 *  entries into one line with a station list/count, it never changes what
 *  the engine reported. */
function parseVerb(text: string): { stationId: string; verb: string; rest: string } | null {
  const m = text.match(/^(\S+)\s+.+?\s(abstaining|degrading|back within takt)(:?\s*)(.*)$/);
  if (!m) return null;
  return { stationId: m[1], verb: m[2], rest: m[4] };
}

interface DisplayRow {
  id: string;
  kind: EventLine['kind'];
  simTick: number;
  text: string;
}

function groupEvents(ordered: EventLine[]): DisplayRow[] {
  const groups = new Map<string, { ids: string[]; first: EventLine; verb: string; rest: string }>();
  const order: string[] = [];

  for (const e of ordered) {
    const parsed = parseVerb(e.text);
    const key = parsed ? `${e.kind}|${parsed.verb}|${parsed.rest}` : `raw|${e.id}`;
    const existing = groups.get(key);
    if (existing) {
      if (parsed) existing.ids.push(parsed.stationId);
    } else {
      groups.set(key, { ids: parsed ? [parsed.stationId] : [], first: e, verb: parsed?.verb ?? '', rest: parsed?.rest ?? '' });
      order.push(key);
    }
  }

  return order.map((key) => {
    const g = groups.get(key)!;
    if (g.ids.length <= 1) {
      return { id: key, kind: g.first.kind, simTick: g.first.simTick, text: g.first.text };
    }
    const who = g.ids.length <= 3 ? g.ids.join(', ') : `${g.ids.length} stations`;
    return { id: key, kind: g.first.kind, simTick: g.first.simTick, text: `${who} ${g.verb}: ${g.rest}` };
  });
}

export function EventsFeed({ events, currentTick }: Props) {
  const [paused, setPaused] = useState(false);
  const frozenRef = useRef<EventLine[]>(events);
  if (!paused) frozenRef.current = events;

  const rows = groupEvents([...frozenRef.current].reverse());

  return (
    <div className="flex h-full flex-col" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex items-baseline justify-between border-b border-line-soft px-5 py-4">
        <h3 className="font-mono text-caption font-bold uppercase tracking-[0.14em] text-ink-primary">Events Feed</h3>
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${
            paused ? 'border-line text-ink-muted' : 'border-measured/30 bg-measured/10 text-measured'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-ink-muted' : 'bg-measured animate-pulseDot'}`} />
          {paused ? 'Paused' : 'Live'}
        </span>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto px-5 py-2">
        {rows.length === 0 ? (
          <EmptyState tick={currentTick} />
        ) : (
          <ul className="flex flex-col">
            <AnimatePresence initial={false}>
              {rows.map((r, i) => (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={STATE_TRANSITION}
                  className={`grid grid-cols-[10px_64px_1fr] items-baseline gap-4 py-3.5 hover:bg-panel-raised/40 ${
                    i > 0 ? 'border-t border-line-soft' : ''
                  }`}
                >
                  <span className={`h-1.5 w-1.5 self-center rounded-full ${KIND_DOT[r.kind]}`} />
                  <span className="font-mono text-[13px] tabular-nums text-ink-muted">{formatTick(r.simTick)}</span>
                  <span className="text-[15px] leading-[1.6] text-white/85">{r.text}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}

/** A resting instrument, not a blank box: a monitoring status line plus a
 *  thin activity baseline that pulses in step with the shift clock, so the
 *  panel reads as alive and watching, not broken or unfinished. */
function EmptyState({ tick }: { tick: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-8">
      <span className="font-mono text-[13px] text-ink-secondary">Monitoring. No events this shift.</span>
      <ActivityBaseline tick={tick} />
    </div>
  );
}

function ActivityBaseline({ tick }: { tick: number }) {
  const bars = 28;
  // A quiet ECG-style baseline — most bars sit flat, a few peak gently on a
  // staggered loop, synced off the real shift tick so it reads as "the
  // twin is watching" rather than a generic loading shimmer.
  return (
    <div className="flex h-4 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        const active = (tick + i) % 6 === 0;
        return (
          <motion.span
            key={i}
            className="w-[2px] rounded-full bg-line-strong"
            initial={{ height: 3, opacity: 0.35 }}
            animate={active ? { height: [3, 11, 3], opacity: [0.35, 0.7, 0.35] } : { height: 3, opacity: 0.35 }}
            transition={active ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: (i % 5) * 0.1 } : { duration: 0.4 }}
          />
        );
      })}
    </div>
  );
}
