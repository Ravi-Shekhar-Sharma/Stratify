import { motion } from 'motion/react';
import { CHART, ChartTitle, AxisTitle } from '../charts/chartKit';
import { DRAW_IN, VALUE_CHANGE } from '@/motion';
import { COLOR } from '@/theme';
import type { ShiftVariation } from '@/opsMetrics';

interface Props {
  variation: ShiftVariation[];
}

const PAD_L = 60;
const PAD_R = 44;
const PAD_T = 60;
const PAD_B = 46;
const ROW_H = 34;
const W = 860;

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/**
 * How much each station's recurring-bottleneck rate swings from one
 * simulated shift to the next — real min/mean/max/stdDev across the
 * held-out shifts, never a day/night calendar comparison (this engine
 * doesn't model distinct shift crews or schedules, and the copy says so).
 * Operator variation is intentionally absent: no operator identity exists
 * anywhere in this engine, so it cannot be shown without fabricating data.
 *
 * Rebuilt as a proper range-and-mean chart (design round 3, item 6): a
 * shared, labelled x-axis in place of ten independent bars each scaled to
 * their own row, stations ordered by range (max - min) so the "some
 * stations are steady, others swing wildly" finding is the first thing
 * visible, and the mean/spread numbers sit immediately to the right of
 * each row's own range line rather than pushed to the panel's far edge.
 */
export function ShiftVariationPanel({ variation }: Props) {
  if (variation.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-6">
        <span className="text-[15px] text-white/72">No shift-variation data for this run.</span>
      </div>
    );
  }

  const sorted = [...variation].sort((a, b) => b.max - b.min - (a.max - a.min));
  const domainMax = Math.max(0.05, ...variation.map((v) => v.max)) * 1.15;
  const plotW = W - PAD_L - PAD_R;
  const H = PAD_T + sorted.length * ROW_H + PAD_B;
  const x = (v: number) => PAD_L + (v / domainMax) * plotW;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * domainMax);
  const axisY = PAD_T + sorted.length * ROW_H + 10;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 640 }} role="img" aria-label="Shift-to-shift variation in recurring bottleneck rate, per station, showing the min-max range and mean across held-out shifts">
          <ChartTitle x={PAD_L} y={26} title="Shift-to-shift variation" subtitle={`Recurring-bottleneck rate range across ${sorted[0]?.n ?? 0} held-out shifts, sorted by spread`} />

          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PAD_T - 8} y2={axisY} stroke={CHART.gridStroke} strokeWidth={1} />
              <text x={x(t)} y={axisY + 16} textAnchor="middle" fontFamily={CHART.monoFont} fontSize={CHART.tickFontSize} fill={CHART.tickFill}>
                {pct(t)}
              </text>
            </g>
          ))}
          <line x1={PAD_L} x2={PAD_L + plotW} y1={axisY} y2={axisY} stroke={CHART.axisStroke} strokeWidth={1} />
          <AxisTitle x={PAD_L + plotW / 2} y={H - 6}>
            Bottleneck rate - share of visits over 1.15x nominal
          </AxisTitle>

          {sorted.map((v, i) => {
            const y = PAD_T + i * ROW_H + ROW_H / 2;
            return (
              <motion.g
                key={v.stationId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease, delay: i * 0.025 }}
              >
                <text x={PAD_L - 10} y={y + 4} textAnchor="end" fontFamily={CHART.monoFont} fontSize={12} fontWeight={600} fill={COLOR.inkPrimary}>
                  {v.stationId}
                </text>
                <line x1={x(v.min)} x2={x(v.max)} y1={y} y2={y} stroke={COLOR.starved} strokeWidth={2} opacity={0.55} strokeLinecap="round" />
                <line x1={x(v.min)} x2={x(v.min)} y1={y - 5} y2={y + 5} stroke={COLOR.starved} strokeWidth={1.5} opacity={0.7} />
                <line x1={x(v.max)} x2={x(v.max)} y1={y - 5} y2={y + 5} stroke={COLOR.starved} strokeWidth={1.5} opacity={0.7} />
                <motion.circle
                  cx={x(v.mean)}
                  cy={y}
                  r={5}
                  fill={COLOR.starved}
                  stroke={COLOR.bgDeep}
                  strokeWidth={1.5}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ ...VALUE_CHANGE, delay: DRAW_IN.duration + i * 0.025 }}
                  style={{ transformOrigin: `${x(v.mean)}px ${y}px` }}
                />
              </motion.g>
            );
          })}
        </svg>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[15px] leading-[1.55] text-white/62">
        The line is the min-max range of the recurring-bottleneck rate across held-out shifts; the dot is the
        mean. A "shift" is one full simulated run, not a day or night crew - this engine models no shift
        schedule, and operator variation is not shown since no operator identity exists in it.
      </p>
    </div>
  );
}
