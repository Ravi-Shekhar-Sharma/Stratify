interface Props {
  fill: number;
  level: 'normal' | 'filling' | 'draining';
  id: string;
}

export function Buffer({ fill, level, id }: Props) {
  const clamped = Math.max(4, Math.min(100, fill));
  const color =
    level === 'filling'
      ? 'bg-slowing'
      : level === 'draining'
        ? 'bg-starved'
        : 'bg-ink-secondary/60';

  return (
    <div className="flex flex-col items-center gap-1.5 pt-7" aria-label={`Buffer ${id}`}>
      <div className="font-mono text-[9px] font-semibold tracking-wider text-ink-muted">
        {id}
      </div>
      <div
        className="relative h-[148px] w-3.5 border border-line bg-panel-inset"
        style={{ borderRadius: 2 }}
      >
        <div
          className={`absolute bottom-0 left-0 w-full transition-all duration-700 ease-out ${color}`}
          style={{ height: `${clamped}%` }}
        />
        <div className="absolute left-0 top-1/2 h-px w-full bg-line/60" />
      </div>
      <div className="font-mono text-[9px] tabular-nums text-ink-secondary">
        {Math.round(clamped)}%
      </div>
    </div>
  );
}
