import { motion } from 'motion/react';
import { CHART, ChartTitle, TIER_COLOR } from '../charts/chartKit';
import { DRAW_IN } from '@/motion';
import { COLOR } from '@/theme';
import { STATIONS_BY_ID } from '@/engine/stations';
import type { SensorInvestment } from '@/investmentMetrics';

interface Props {
  ranked: SensorInvestment[];
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function usd(x: number): string {
  return `$${Math.round(x).toLocaleString('en-US')}`;
}

const PAD_L = 190;
const PAD_R = 76;
const PAD_T = 66;
const PAD_B = 40;
const ROW_H = 38;
const W = 960;

/**
 * Every non-sensored station, ranked by confidence gained per dollar of
 * plant-deployable instrumentation spend. Rebuilt (design round 3, items 8
 * and 9) as a ranked bar chart, not a table: the old table repeated an
 * identical cost range on all ten rows and a gain/$1,000 column that only
 * differed past two decimals, which reads as placeholder data even though
 * the underlying reasoning is honest. Since cost is one plant-wide figure
 * (docs/assumptions.md gives an order-of-magnitude range, not a
 * per-station estimate), it is stated once, above the chart, as the reason
 * ranking is driven entirely by confidence gain - not repeated ten times
 * or hidden in a column nobody needed.
 *
 * The bar axis starts near the observed minimum, not at zero: real
 * confidence gain here spans roughly {min}-{max} points, and a 0-100%
 * axis would flatten every bar to the same near-full length, recreating
 * the exact "looks like fake data" problem this rebuild exists to fix.
 * The axis ticks are real, labelled values (never hidden), so the
 * non-zero start is disclosed, not concealed.
 */
export function RankedInvestmentTable({ ranked }: Props) {
  if (ranked.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-6">
        <span className="text-[15px] text-white/72">No candidate stations for this run.</span>
      </div>
    );
  }

  const gains = ranked.map((r) => r.confidenceGain);
  const gainMin = Math.min(...gains);
  const gainMax = Math.max(...gains);
  const domainMin = Math.max(0, gainMin - (gainMax - gainMin) * 0.6 - 0.01);
  const domainMax = gainMax + (gainMax - gainMin) * 0.25 + 0.01;
  const plotW = W - PAD_L - PAD_R;
  const H = PAD_T + ranked.length * ROW_H + PAD_B;
  const x = (v: number) => PAD_L + ((v - domainMin) / (domainMax - domainMin)) * plotW;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => domainMin + f * (domainMax - domainMin));
  const axisY = PAD_T + ranked.length * ROW_H + 6;
  const first = ranked[0];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line-soft bg-panel-inset/60 px-5 py-3">
        <span className="font-mono text-[12.5px] leading-[1.5] text-ink-secondary">
          Every candidate costs the same to instrument -{' '}
          <span className="font-semibold text-ink-primary">
            {usd(first.costLowUsd)}-{usd(first.costHighUsd)}
          </span>{' '}
          per station, one plant-wide range, not a per-station estimate. Ranking below is driven entirely by
          confidence gained.
        </span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ minWidth: 640 }}
          role="img"
          aria-label="Candidate stations ranked by confidence gained if instrumented, from highest to lowest"
        >
          <ChartTitle x={PAD_L} y={26} title="Ranked by confidence gain" subtitle={`${ranked.length} candidate stations, highest gain first`} />

          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PAD_T - 6} y2={axisY} stroke={CHART.gridStroke} strokeWidth={1} />
              <text x={x(t)} y={axisY + 16} textAnchor="middle" fontFamily={CHART.monoFont} fontSize={CHART.tickFontSize} fill={CHART.tickFill}>
                {pct(t)}
              </text>
            </g>
          ))}
          <line x1={PAD_L} x2={PAD_L + plotW} y1={axisY} y2={axisY} stroke={CHART.axisStroke} strokeWidth={1} />

          {ranked.map((r, i) => {
            const y = PAD_T + i * ROW_H + ROW_H / 2;
            const barX0 = x(domainMin);
            const barX1 = x(r.confidenceGain);
            const isBlind = r.tier === 'blind';
            return (
              <motion.g
                key={r.stationId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease, delay: i * 0.02 }}
              >
                <text x={PAD_L - 10} y={y - 8} textAnchor="end" fontFamily={CHART.monoFont} fontSize={12} fontWeight={700} fill={COLOR.inkPrimary}>
                  {r.stationId}
                  <tspan fontFamily={CHART.sansFont} fontWeight={400} fontSize={10.5} fill={CHART.labelFill}>
                    {'  '}{STATIONS_BY_ID[r.stationId]?.name ?? ''}
                  </tspan>
                </text>
                <text x={PAD_L - 10} y={y + 8} textAnchor="end" fontFamily={CHART.sansFont} fontSize={10} fill={CHART.tickFill}>
                  {r.tier}
                </text>
                <rect x={barX0} y={y - 8} width={Math.max(2, barX1 - barX0)} height={16} rx={3} fill={TIER_COLOR[r.tier]} opacity={isBlind ? 0.45 : 0.85} />
                {isBlind && <rect x={barX0} y={y - 8} width={Math.max(2, barX1 - barX0)} height={16} rx={3} fill="none" stroke={TIER_COLOR[r.tier]} strokeWidth={1} opacity={0.9} />}
                <text x={barX1 + 8} y={y + 4} fontFamily={CHART.monoFont} fontSize={11.5} fontWeight={600} fill={COLOR.inkPrimary}>
                  +{pct(r.confidenceGain)}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>
      <div className="px-4 pb-3 pt-1">
        <p className="text-[15px] leading-[1.55] text-white/72">
          Bars start near the observed minimum ({pct(domainMin)}), not zero - real gain across these stations spans
          only {pct(gainMin)}-{pct(gainMax)}, so a 0-100% axis would flatten every bar to the same length. Axis
          ticks above are the real values.
        </p>
      </div>
    </div>
  );
}
