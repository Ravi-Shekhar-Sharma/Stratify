import { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { STATE_TRANSITION, VALUE_CHANGE } from '@/motion';
import { AnimatedNumber } from './AnimatedNumber';
import { Panel } from './Panel';
import { PanelTitle } from './PanelTitle';
import { CONFIDENCE_CEILING } from '@/engine/inference/softSensor';
import { STATIONS } from '@/engine/stations';
import type { StationViewModel } from '@/twinTypes';

interface Props {
  target: StationViewModel | null;
}

const HATCH_BACKGROUND =
  'repeating-linear-gradient(135deg, #4B5563 0px, #4B5563 1.5px, transparent 1.5px, transparent 8px)';

const R = 52;
const C = 2 * Math.PI * R;
const HISTORY_LEN = 24;
const TIER_WORD = { sensored: 'Sensored', partial: 'Partial', blind: 'Blind' } as const;

const STATION_INDEX = new Map(STATIONS.map((s, i) => [s.id, i]));

function neighborsOf(stationId: string) {
  const idx = STATION_INDEX.get(stationId);
  if (idx === undefined) return [];
  return [STATIONS[idx - 1], STATIONS[idx + 1]].filter((s): s is (typeof STATIONS)[number] => s !== undefined);
}

/** Keeps a rolling window of a station's observed cycle time across renders
 *  — the engine reports one value per snapshot, not a history, so the
 *  sparkline retains what it has actually seen rather than fabricating a
 *  trend. Resets when the target station changes. */
function useCycleHistory(stationId: string | undefined, value: number | undefined) {
  const ref = useRef<{ id: string | undefined; values: number[] }>({ id: undefined, values: [] });
  if (ref.current.id !== stationId) {
    ref.current = { id: stationId, values: value !== undefined ? [value] : [] };
  } else if (value !== undefined) {
    const last = ref.current.values[ref.current.values.length - 1];
    if (last !== value) {
      ref.current.values = [...ref.current.values, value].slice(-HISTORY_LEN);
    }
  }
  return ref.current.values;
}

/**
 * The one place a single station's inference gets the room it deserves —
 * and, deliberately, the one shape whether or not there's currently a live
 * target. At rest this reads as an idling instrument (ring parked at zero,
 * rows reading "—", the tier ceiling still shown because that's a real
 * system constant regardless of the moment) rather than collapsing to one
 * sentence in a mostly-empty card. Only "abstained" gets a genuinely
 * different layout, because a refusal is real, distinct content, not an
 * absence of it.
 */
export function InferenceDetail({ target }: Props) {
  const liveState =
    target && (target.state.kind === 'inferred' || target.state.kind === 'degrading') ? target.state : null;
  const history = useCycleHistory(liveState ? target!.spec.id : undefined, liveState?.cycleSeconds);
  const abstained = target?.state.kind === 'abstained';

  return (
    <Panel elevation="raised" className="flex h-full flex-col overflow-hidden">
      <PanelTitle title="Inference Detail" subtitle="Cause" />
      <div className="flex flex-1 flex-col gap-5 px-7 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {abstained && target ? (
            <motion.div
              key="abstained"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STATE_TRANSITION}
              className="relative w-full overflow-hidden rounded-lg border border-line-soft px-5 py-5"
            >
              <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: HATCH_BACKGROUND }} aria-hidden />
              <div className="relative flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-caption uppercase tracking-[0.08em] text-white/50">Abstained</span>
                  <span className="font-mono text-h3 font-bold text-ink-primary">
                    {target.spec.id} {target.spec.name}
                  </span>
                  <p className="text-[15px] leading-[1.6] text-white/72">Below floor. Not guessing.</p>
                  <p className="text-[13px] leading-[1.5] text-white/50">
                    {target.state.kind === 'abstained' ? target.state.reason : ''}
                  </p>
                </div>
                {target.state.kind === 'abstained' && target.state.withheld && (
                  <UncertaintyBand withheld={target.state.withheld} nominal={target.spec.nominalCycleSeconds} />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={liveState ? `${target!.spec.id}:live` : 'resting'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={STATE_TRANSITION}
              className="flex w-full flex-col gap-5"
            >
              <div className="flex items-center gap-7">
                <ConfidenceRing confidence={liveState?.confidence ?? 0} critical={liveState?.kind === 'degrading'} resting={!liveState} />
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-caption uppercase tracking-[0.08em] ${
                        !liveState ? 'text-measured' : liveState.kind === 'degrading' ? 'text-slowing' : 'text-inferred'
                      }`}
                    >
                      {!liveState ? 'Nominal' : liveState.kind === 'degrading' ? 'Degrading' : 'Inferred'}
                    </span>
                    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-white/50">
                      {target ? TIER_WORD[target.spec.tier] : '-'}
                    </span>
                  </div>
                  <span className="truncate font-mono text-h2 font-bold text-ink-primary">
                    {target ? `${target.spec.id} ${target.spec.name}` : 'No active target'}
                  </span>
                  <Row
                    label="Est. cycle"
                    value={
                      liveState ? (
                        <span className="font-mono tabular-nums text-ink-primary">
                          <AnimatedNumber value={liveState.cycleSeconds} format={(v) => v.toFixed(1)} />s
                          <span className="ml-2 text-[13px] text-white/50">nominal {target!.spec.nominalCycleSeconds}s</span>
                        </span>
                      ) : (
                        <span className="font-mono text-ink-muted">-</span>
                      )
                    }
                  />
                  <Row
                    label="Confidence ceiling, this tier"
                    value={<span className="font-mono tabular-nums text-ink-primary">{(CONFIDENCE_CEILING * 100).toFixed(0)}%</span>}
                  />
                </div>
              </div>

              <div className="flex items-end justify-between gap-6 border-t border-line-soft pt-4">
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/50">Cycle trend</span>
                  <Sparkline values={history} critical={liveState?.kind === 'degrading'} />
                </div>
                <div className="flex flex-col gap-1.5 text-right">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/50">Inferred from</span>
                  <span className="font-mono text-[13px] text-ink-primary">
                    {target
                      ? neighborsOf(target.spec.id)
                          .map((n) => n.id)
                          .join(', ') || '-'
                      : '-'}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Panel>
  );
}

function ConfidenceRing({ confidence, critical, resting }: { confidence: number; critical?: boolean; resting: boolean }) {
  const dash = confidence * C;
  const stroke = resting ? '#3A4046' : critical ? '#FBBF24' : '#22D3EE';
  return (
    <div className="relative h-[112px] w-[112px] shrink-0">
      <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90">
        <circle cx="56" cy="56" r={R} fill="none" stroke="#2A2F34" strokeWidth="7" />
        {!resting && (
          <motion.circle
            cx="56"
            cy="56"
            r={R}
            fill="none"
            stroke={stroke}
            strokeWidth="7"
            strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${C}` }}
            animate={{ strokeDasharray: `${dash} ${C - dash}` }}
            transition={VALUE_CHANGE}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {resting ? (
          <span className="font-mono text-[22px] font-bold leading-none text-ink-muted">-</span>
        ) : (
          <span className="font-mono text-[24px] font-bold tabular-nums leading-none text-ink-primary">
            <AnimatedNumber value={confidence * 100} format={(v) => v.toFixed(0)} />
          </span>
        )}
        <span className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-white/50">
          {resting ? 'idle' : 'confidence'}
        </span>
      </div>
    </div>
  );
}

/**
 * Makes abstention explorable instead of a bare grey refusal: the model's
 * own withheld interval, drawn wide enough that "why we didn't report
 * this" is visually self-evident — a band this wide covers too many
 * plausible cycle times to be worth a single number. Real model output
 * (`intervalLowSeconds`/`intervalHighSeconds` from the soft sensor), never
 * a fabricated illustration; it's exactly what the sensor computed right
 * before the confidence floor told it not to report.
 */
function UncertaintyBand({
  withheld,
  nominal,
}: {
  withheld: { cycleSeconds: number; lowSeconds: number; highSeconds: number; confidence: number };
  nominal: number;
}) {
  const W = 220;
  const H = 34;
  const pad = withheld.highSeconds - withheld.lowSeconds || 1;
  const min = Math.min(withheld.lowSeconds, nominal) - pad * 0.25;
  const max = Math.max(withheld.highSeconds, nominal) + pad * 0.25;
  const span = Math.max(max - min, 1);
  const xAt = (v: number) => ((v - min) / span) * W;

  const bandX0 = xAt(withheld.lowSeconds);
  const bandX1 = xAt(withheld.highSeconds);
  const pointX = xAt(withheld.cycleSeconds);
  const nominalX = xAt(nominal);

  return (
    <div className="flex flex-col gap-1.5 border-t border-line-soft pt-3">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/50">Withheld estimate</span>
        <span className="font-mono text-[11px] tabular-nums text-white/50">
          {withheld.lowSeconds.toFixed(0)}–{withheld.highSeconds.toFixed(0)}s
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[34px] w-full" preserveAspectRatio="none">
        <line x1={nominalX} x2={nominalX} y1={2} y2={H - 2} stroke="#3A4046" strokeWidth="1" strokeDasharray="2 2" />
        <rect x={bandX0} y={H / 2 - 5} width={Math.max(bandX1 - bandX0, 2)} height={10} rx={5} fill="#4B5563" opacity={0.5} />
        <circle cx={pointX} cy={H / 2} r={3} fill="#9CA3AF" />
      </svg>
      <div className="flex items-baseline justify-between font-mono text-[10.5px] text-white/50">
        <span>point est. {withheld.cycleSeconds.toFixed(0)}s</span>
        <span>nominal {nominal}s</span>
        <span>{(withheld.confidence * 100).toFixed(0)}% conf.</span>
      </div>
    </div>
  );
}

function Sparkline({ values, critical }: { values: number[]; critical?: boolean }) {
  const W = 140;
  const H = 32;
  if (values.length < 2) {
    return <div className="h-[32px] w-[140px] border-b border-dashed border-line-soft" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / span) * H;
    return [x, y] as const;
  });
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[32px] w-[140px]" preserveAspectRatio="none">
      <path
        d={line}
        fill="none"
        stroke={critical ? '#FBBF24' : '#22D3EE'}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-line-soft pt-2">
      <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-white/50">{label}</span>
      <span className="text-[15px]">{value}</span>
    </div>
  );
}
