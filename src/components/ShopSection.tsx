import { useState } from 'react';
import type { StationViewModel } from '@/twinTypes';
import { SHOP_LABEL } from '@/twinTypes';
import type { Shop } from '@/engine/types';
import { StationCard } from './StationCard';
import { Buffer } from './Buffer';
import type { BufferViewModel } from '@/twinTypes';

interface Props {
  shop: Shop;
  stations: StationViewModel[];
  /** Buffer to render immediately after a given station id, if any. */
  bufferAfter: Map<string, BufferViewModel>;
  defaultExpanded: boolean;
}

const STATE_COUNT_ORDER = ['degrading', 'abstained', 'inferred', 'measured', 'pending'] as const;

const STATE_DOT_CLASS: Record<(typeof STATE_COUNT_ORDER)[number], string> = {
  degrading: 'bg-slowing',
  abstained: 'bg-ink-muted',
  inferred: 'bg-inferred',
  measured: 'bg-measured',
  pending: 'bg-ink-faint',
};

export function ShopSection({ shop, stations, bufferAfter, defaultExpanded }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const counts: Record<(typeof STATE_COUNT_ORDER)[number], number> = {
    degrading: 0,
    abstained: 0,
    inferred: 0,
    measured: 0,
    pending: 0,
  };
  for (const sv of stations) counts[sv.state.kind]++;

  const sensoredCount = stations.filter((s) => s.spec.tier === 'sensored').length;
  const partialCount = stations.filter((s) => s.spec.tier === 'partial').length;
  const blindCount = stations.filter((s) => s.spec.tier === 'blind').length;

  return (
    <section className="border-b border-line-soft bg-bg">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-6 pt-3 pb-2 text-left"
        aria-expanded={expanded}
      >
        <span className={`h-3 w-0.5 ${expanded ? 'bg-cyan' : 'bg-line-strong'}`} />
        <h2 className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">
          {SHOP_LABEL[shop]}
        </h2>
        <span className="font-mono text-[9px] tabular-nums text-ink-muted">
          {stations.length} stations · {sensoredCount} sensored · {partialCount} partial · {blindCount} blind
        </span>
        <span className="ml-auto flex items-center gap-3">
          {STATE_COUNT_ORDER.filter((k) => counts[k] > 0).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 ${STATE_DOT_CLASS[k]}`} />
              <span className="font-mono text-[9px] tabular-nums text-ink-secondary">{counts[k]}</span>
            </span>
          ))}
          <span className="font-mono text-[10px] text-ink-muted">{expanded ? '▾' : '▸'}</span>
        </span>
      </button>

      {expanded && (
        <div className="overflow-x-auto thin-scroll">
          <div className="flex min-w-max items-start gap-0 px-5 pb-4">
            {stations.map((sv) => {
              const buf = bufferAfter.get(sv.spec.id);
              return (
                <div key={sv.spec.id} className="flex items-start">
                  <StationCard spec={sv.spec} state={sv.state} />
                  {buf && <Buffer id={buf.id} label={buf.label} fillPct={buf.fillPct} trend={buf.trend} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
