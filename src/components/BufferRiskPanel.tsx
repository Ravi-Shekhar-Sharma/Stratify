import { motion, AnimatePresence } from 'motion/react';
import { STATE_TRANSITION, VALUE_CHANGE, DRAW_IN } from '@/motion';
import { AnimatedNumber } from './AnimatedNumber';
import { Panel } from './Panel';
import { PanelTitle } from './PanelTitle';
import { TRIM_CHASSIS_BUFFER } from '@/engine/topology';

interface Props {
  bufferHistory: number[];
  secondsToEmpty: number | null;
}

const EMPTY_EPSILON = 0.05;
const W = 300;
const H = 90;

function formatDuration(seconds: number): { value: number; unit: string } {
  if (seconds < 90) return { value: Math.round(seconds), unit: 's' };
  return { value: Math.round(seconds / 60), unit: 'min' };
}

/**
 * The only buffer on this line with real capacity to observe (see
 * docs/assumptions.md's derivation of the 7-minute lead time) — the panel
 * that turns that headroom into a legible drain story: a live "time to
 * starvation" projection, current vs nominal fill, and a real sparkline.
 */
export function BufferRiskPanel({ bufferHistory, secondsToEmpty }: Props) {
  const capacity = TRIM_CHASSIS_BUFFER.capacity;
  const nominal = TRIM_CHASSIS_BUFFER.nominalFill;
  const current = bufferHistory.length > 0 ? bufferHistory[bufferHistory.length - 1] : nominal;
  const empty = current <= EMPTY_EPSILON;
  const draining = !empty && secondsToEmpty !== null;
  const critical = empty || draining;
  const fillPct = Math.max(0, Math.min(100, (current / capacity) * 100));
  const nominalPct = Math.max(0, Math.min(100, (nominal / capacity) * 100));

  const points =
    bufferHistory.length >= 2
      ? bufferHistory.map((v, i) => {
          const x = (i / (bufferHistory.length - 1)) * W;
          const y = H - (v / capacity) * H;
          return [x, y] as const;
        })
      : [];
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const lineColor = critical ? '#FB7185' : '#22D3EE';
  const countdown = draining && secondsToEmpty !== null ? formatDuration(secondsToEmpty) : null;

  const trend = bufferHistory.length >= 2 ? bufferHistory[bufferHistory.length - 1] - bufferHistory[bufferHistory.length - 2] : 0;
  const trendWord = empty ? 'Empty' : trend < -0.01 ? 'Draining' : trend > 0.01 ? 'Refilling' : 'Stable';

  return (
    <Panel elevation="raised" className="flex h-full flex-col overflow-hidden">
      <PanelTitle title="Buffer Risk" subtitle="Effect" />
      <div className="flex flex-1 flex-col gap-5 px-7 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {countdown ? (
            <motion.div
              key="countdown"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STATE_TRANSITION}
              className="flex items-baseline gap-3"
            >
              <span className="font-mono text-[13px] font-medium uppercase tracking-[0.06em] text-white/50">
                Starves in ~
              </span>
              <span className="font-mono text-[34px] font-bold leading-none tabular-nums text-starved">
                <AnimatedNumber value={countdown.value} format={(v) => v.toFixed(0)} />
                <span className="ml-1 text-[15px] font-semibold text-starved/70">{countdown.unit}</span>
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="headline"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={STATE_TRANSITION}
              className={`text-[16px] font-semibold leading-[1.4] ${empty ? 'text-starved' : 'text-ink-primary'}`}
            >
              {empty ? 'Empty. Downstream is not receiving supply.' : 'Stable. No starvation projected.'}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${critical ? 'bg-starved' : 'bg-cyan'}`}
            aria-hidden
          />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-white/50">{trendWord}</span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <Stat label="Current fill" value={current} unit="units" tone={critical ? 'text-starved' : 'text-ink-primary'} />
          <Stat label="Nominal fill" value={nominal} unit="units" tone="text-white/72" />
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="h-[70px] w-full" preserveAspectRatio="none">
          <line x1="0" y1={H - nominalPct * (H / 100)} x2={W} y2={H - nominalPct * (H / 100)} stroke="#3A4046" strokeWidth="1" strokeDasharray="3 4" />
          {points.length > 0 && (
            <motion.path
              d={line}
              fill="none"
              stroke={lineColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease }}
            />
          )}
        </svg>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-inset">
          <motion.div
            className={`h-full rounded-full ${critical ? 'bg-starved' : 'bg-cyan'}`}
            animate={{ width: `${fillPct}%` }}
            transition={VALUE_CHANGE}
          />
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: number; unit: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-white/50">{label}</span>
      <span className={`font-mono text-[22px] font-bold tabular-nums leading-none ${tone}`}>
        <AnimatedNumber value={value} format={(v) => v.toFixed(1)} />
        <span className="ml-1 text-[12px] font-medium text-white/50">{unit}</span>
      </span>
    </div>
  );
}
