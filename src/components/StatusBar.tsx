import { TAKT_SECONDS } from '@/engine/stations';
import type { EnginePhase } from '@/twinTypes';

interface Props {
  rateJph: number;
  phase: EnginePhase;
  currentTick: number;
  totalTicks: number;
  playbackMultiple: number;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export function StatusBar({ rateJph, phase, currentTick, totalTicks, playbackMultiple }: Props) {
  const incident = phase === 'incident';
  const statusText = phase === 'connecting' ? 'CONNECTING' : incident ? 'INCIDENT' : 'LIVE';

  return (
    <header className="border-b border-line bg-bg">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center border border-line bg-panel" style={{ borderRadius: 0 }}>
            <span className="h-2.5 w-2.5 bg-cyan" />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-[0.14em] text-ink-primary">STRATIFY</div>
            <div className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-ink-secondary">
              42-Station Twin · Simulated
            </div>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-line sm:block" />

        <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
          <Metric label="TAKT" value={`${TAKT_SECONDS}s`} />
          <Metric
            label="RATE"
            value={`${rateJph.toFixed(0)} JPH`}
            valueClass={incident ? 'text-slowing' : 'text-ink-primary'}
          />
        </div>

        <div className="ml-auto flex items-center gap-5">
          <div className="flex items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">SHIFT</span>
            <span className="font-mono text-[15px] font-semibold tabular-nums text-ink-primary">
              {formatElapsed(currentTick)}
            </span>
            <span className="font-mono text-[9px] tabular-nums text-ink-muted">×{playbackMultiple.toFixed(0)}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${incident ? 'bg-starved animate-pulseDotCrit' : 'bg-measured animate-pulseDot'}`}
            />
            <span
              className={`border px-3 py-1 text-[11px] font-bold tracking-[0.22em] ${
                incident ? 'border-starved/60 bg-starved/10 text-starved' : 'border-measured/50 bg-measured/10 text-measured'
              }`}
              style={{ borderRadius: 0 }}
            >
              {statusText}
            </span>
          </div>
        </div>
      </div>

      {totalTicks > 0 && (
        <div className="h-px w-full bg-line-soft">
          <div
            className="h-px bg-cyan/60 transition-[width] duration-150 ease-out"
            style={{ width: `${Math.min(100, (currentTick / (totalTicks - 1)) * 100)}%` }}
          />
        </div>
      )}
    </header>
  );
}

function Metric({ label, value, valueClass = 'text-ink-primary' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-secondary">{label}</span>
      <span className={`font-mono text-[17px] font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
