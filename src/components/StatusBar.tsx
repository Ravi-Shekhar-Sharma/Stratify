import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { useAnimatedNumber } from '@/useAnimatedNumber';

interface Props {
  rateJph: number;
  ftt: number;
  pill: 'LIVE' | 'INCIDENT';
  phase: 'connecting' | 'steady' | 'incident';
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString('en-GB', { hour12: false });
}

export function StatusBar({ rateJph, ftt, pill, phase }: Props) {
  const rate = useAnimatedNumber(rateJph, 500);
  const fttAnim = useAnimatedNumber(ftt, 500);
  const clock = useClock();

  const pillCrit = pill === 'INCIDENT';
  const statusText = phase === 'connecting' ? 'CONNECTING' : pill;

  return (
    <header className="border-b border-line bg-bg">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-line bg-panel" style={{ borderRadius: 3 }}>
            <Activity className="h-5 w-5 text-cyan" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-[0.14em] text-ink-primary">
              STRATIFY
            </div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-ink-secondary">
              Final Assembly Twin · Line A
            </div>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-line sm:block" />

        {/* Metrics */}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
          <Metric label="TAKT" value="58s" />
          <Metric
            label="RATE"
            value={`${rate.toFixed(0)} JPH`}
            valueClass={pillCrit ? 'text-starved' : 'text-ink-primary'}
          />
          <Metric
            label="FTT"
            value={`${fttAnim.toFixed(1)}%`}
            valueClass={pillCrit ? 'text-slowing' : 'text-ink-primary'}
          />
        </div>

        {/* Clock + status pill — pushed right */}
        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
              TIME
            </span>
            <span className="font-mono text-[15px] font-semibold tabular-nums text-ink-primary">
              {clock}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${
                pillCrit ? 'bg-starved animate-pulseDotCrit' : 'bg-measured animate-pulseDot'
              }`}
            />
            <span
              className={`border px-3 py-1 text-[11px] font-bold tracking-[0.22em] ${
                pillCrit
                  ? 'border-starved/60 bg-starved/10 text-starved'
                  : 'border-measured/50 bg-measured/10 text-measured'
              }`}
              style={{ borderRadius: 3 }}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function Metric({
  label,
  value,
  valueClass = 'text-ink-primary',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-secondary">
        {label}
      </span>
      <span className={`font-mono text-[17px] font-bold tabular-nums ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
