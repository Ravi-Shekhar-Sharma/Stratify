interface Props {
  id: string;
  label: string;
  fillPct: number;
  trend: 'normal' | 'filling' | 'draining';
}

export function Buffer({ id, label, fillPct, trend }: Props) {
  const clamped = Math.max(0, Math.min(100, fillPct));
  const color = trend === 'filling' ? 'bg-slowing' : trend === 'draining' ? 'bg-starved' : 'bg-ink-secondary/60';

  return (
    <div className="flex flex-col items-center gap-1.5 pt-7" aria-label={`Buffer ${label}: ${clamped.toFixed(0)}% (${trend})`}>
      <div className="w-16 truncate text-center font-mono text-[8px] font-semibold uppercase tracking-wider text-ink-muted">
        {id}
      </div>
      <div className="relative h-[148px] w-3.5 border border-line bg-panel-inset" style={{ borderRadius: 0 }}>
        <div
          className={`absolute bottom-0 left-0 w-full transition-[height] duration-150 ease-out ${color}`}
          style={{ height: `${clamped}%` }}
        />
      </div>
      <div className="font-mono text-[9px] tabular-nums text-ink-secondary">{Math.round(clamped)}%</div>
    </div>
  );
}
