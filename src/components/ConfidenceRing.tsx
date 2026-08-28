import { useAnimatedNumber } from '@/useAnimatedNumber';

interface Props {
  confidence: number;
  cycle: number;
  active: boolean;
}

export function ConfidenceRing({ confidence, cycle, active }: Props) {
  const conf = useAnimatedNumber(confidence, 700);
  const pct = Math.max(0, Math.min(100, conf));
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const ringColor = active ? '#E0A83E' : '#56B6E0';
  const baseCycle = 55;

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="S6 · Station Inference" subtitle="Soft-sensor estimate" />

      <div className="flex flex-1 items-center gap-5 px-4 pb-4 pt-3">
        {/* Ring */}
        <div className="relative h-[132px] w-[132px] shrink-0">
          <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
            <circle
              cx="66" cy="66" r={r}
              fill="none" stroke="#1E2730" strokeWidth="8"
            />
            <circle
              cx="66" cy="66" r={r}
              fill="none" stroke={ringColor} strokeWidth="8"
              strokeLinecap="butt"
              strokeDasharray={`${dash} ${c - dash}`}
              style={{ transition: 'stroke 300ms ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-[34px] font-bold tabular-nums text-ink-primary leading-none">
              {pct.toFixed(0)}
              <span className="text-[18px] text-ink-secondary">%</span>
            </span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">
              confidence
            </span>
          </div>
        </div>

        {/* Source rows */}
        <div className="flex flex-1 flex-col gap-3">
          <Row label="Source" value="neighbour buffers B5/B6" />
          <Row
            label="Est. cycle"
            value={`~${cycle.toFixed(0)}s`}
            sub={`base ${baseCycle}s`}
            valueClass={active ? 'text-slowing' : 'text-ink-primary'}
          />
          <Row label="Method" value="soft-sensor + physics baseline" small />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  small,
  valueClass = 'text-ink-primary',
}: {
  label: string;
  value: string;
  sub?: string;
  small?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-secondary">
        {label}
      </span>
      <span className={`font-mono ${small ? 'text-[11px]' : 'text-[13px]'} font-semibold ${valueClass}`}>
        {value}
        {sub && <span className="ml-1.5 text-[10px] text-ink-secondary">({sub})</span>}
      </span>
    </div>
  );
}

function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line-soft px-4 py-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-primary">
        {title}
      </h3>
      <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-secondary">
        {subtitle}
      </span>
    </div>
  );
}

export { PanelTitle };
