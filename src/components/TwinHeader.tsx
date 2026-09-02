import { AnimatedNumber } from './AnimatedNumber';
import { TAKT_SECONDS } from '@/engine/stations';
import { CONFIDENCE_CEILING } from '@/engine/inference/softSensor';
import { DEMO_LEAD_TIME_SECONDS } from '@/engine/assumptions';
import type { EnginePhase } from '@/twinTypes';

interface Props {
  stationCount: number;
  blindPartialCount: number;
  rateJph: number;
  phase: EnginePhase;
  currentTick: number;
  totalTicks: number;
}

const LEAD_MINUTES = Math.round((DEMO_LEAD_TIME_SECONDS / 60) * 10) / 10;

/**
 * Opens the Floor view with the argument, not the spec sheet: most twins go
 * blind exactly where the losses hide, and this line keeps estimating
 * there anyway. The three numbers underneath are the entire pitch — how
 * much of the line is dark to conventional systems, how much warning that
 * still buys before a line stop, and how far a blind station's confidence
 * actually reaches — so they lead here instead of three scrolls down.
 * Takt/Rate stay, but as the secondary operational row they are.
 */
export function TwinHeader({ stationCount, blindPartialCount, rateJph, phase, currentTick, totalTicks }: Props) {
  const incident = phase === 'incident';

  return (
    <header className="border-b border-line-soft px-6 pb-8 pt-10 sm:px-8">
      <h1 className="max-w-3xl text-[32px] font-bold font-mono leading-[1.1] tracking-[-0.01em] text-ink-primary sm:text-[42px] sm:leading-[1.08] sm:tracking-[-0.015em] lg:text-display lg:leading-[1.05] lg:tracking-[-0.02em]">
        Most twins go blind on the stations nobody instrumented.
      </h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-[1.6] text-white/72">
        That is exactly where the losses hide. Stratify keeps estimating there anyway - measured where sensored,
        inferred with confidence where not, and honest about it when confidence can't clear the floor.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <ProofStat
          value={blindPartialCount}
          suffix={`of ${stationCount}`}
          label="Stations dark to conventional systems"
          tone="text-starved"
        />
        <ProofStat value={LEAD_MINUTES} suffix="min" label="Warning delivered before a line stop" tone="text-cyan" />
        <ProofStat
          value={Math.round(CONFIDENCE_CEILING * 100)}
          suffix="%"
          label="Calibrated confidence on a blind station"
          tone="text-measured"
        />
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-8 border-t border-line-soft pt-6">
        <Metric label="Takt" value={`${TAKT_SECONDS}s`} />
        <Metric
          label="Rate"
          valueNode={
            <span className={incident ? 'text-slowing' : 'text-ink-primary'}>
              <AnimatedNumber value={rateJph} format={(v) => v.toFixed(0)} />
              <span className="ml-1 text-[11px] text-ink-muted">JPH</span>
            </span>
          }
        />
      </div>

      {totalTicks > 0 && (
        <div className="mt-5 h-px w-full bg-line-soft">
          <div
            className="h-px bg-cyan/50 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, (currentTick / (totalTicks - 1)) * 100)}%` }}
          />
        </div>
      )}
    </header>
  );
}

function ProofStat({ value, suffix, label, tone }: { value: number; suffix: string; label: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`font-mono text-[36px] font-bold leading-none tabular-nums ${tone}`}>
        <AnimatedNumber value={value} format={(v) => v.toFixed(0)} />
        <span className="ml-1.5 text-[15px] font-semibold text-white/50">{suffix}</span>
      </span>
      <span className="text-[13px] leading-[1.4] text-white/72">{label}</span>
    </div>
  );
}

function Metric({ label, value, valueNode }: { label: string; value?: string; valueNode?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption uppercase tracking-[0.08em] text-white/50">{label}</span>
      <span className="font-mono text-[20px] font-semibold tabular-nums text-ink-primary">{valueNode ?? value}</span>
    </div>
  );
}
