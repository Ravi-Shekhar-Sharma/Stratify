import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CHART, ChartTitle, AxisTitle } from '../charts/chartKit';
import { DRAW_IN, VALUE_CHANGE } from '@/motion';
import { COLOR } from '@/theme';
import type { BudgetTier } from '@/investmentMetrics';

interface Props {
  tiers: BudgetTier[];
}

function usd(x: number): string {
  return `$${Math.round(x).toLocaleString('en-US')}`;
}

const W = 880;
const H = 400;
const PAD_L = 74;
const PAD_R = 40;
const PAD_T = 64;
const PAD_B = 54;

/**
 * Three fixed budget levels, not a live slider — each covers a real top-N
 * slice of the ranked table, with cost and aggregate confidence gain
 * summed from the same figures, never a round invented dollar amount.
 *
 * Rebuilt (design round 3, item 10) as a real cumulative progression
 * chart rather than three text cards: cumulative spend on the x-axis
 * against cumulative confidence gain on the y-axis, from the origin
 * (0 spend, 0 gain) through each tier in order, so whether the return
 * scales roughly linearly with spend or diminishes is a shape a reader
 * sees, not a comparison they compute themselves across three
 * paragraphs. Cost mid (the average of each tier's own low/high range,
 * both already real computed figures) places each point on the x-axis.
 *
 * Hover interaction matches Trust's CalibrationChart (user request): each
 * point carries a minimal always-visible annotation (just the gain, so the
 * curve's shape reads at a glance) plus a >=18px hit target that reveals a
 * full tooltip on hover/focus — tier label, cost range, station count and
 * the real station IDs included, the same detail the old permanent backing
 * -plate label used to carry, now on demand instead of always on screen.
 */
export function BudgetTierCards({ tiers }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  if (tiers.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-6">
        <span className="text-[15px] text-white/72">No budget tiers for this run.</span>
      </div>
    );
  }

  const points = [
    { label: 'Start', costMid: 0, gain: 0, costLow: 0, costHigh: 0, stationCount: 0, stationIds: [] as string[] },
    ...tiers.map((t) => ({
      label: t.label,
      costMid: (t.totalCostLowUsd + t.totalCostHighUsd) / 2,
      gain: t.totalConfidenceGain,
      costLow: t.totalCostLowUsd,
      costHigh: t.totalCostHighUsd,
      stationCount: t.stationCount,
      stationIds: t.stationIds,
    })),
  ];
  const maxCost = Math.max(...points.map((p) => p.costMid)) * 1.12;
  const maxGain = Math.max(...points.map((p) => p.gain)) * 1.15;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const x = (v: number) => PAD_L + (v / maxCost) * plotW;
  const y = (v: number) => PAD_T + plotH - (v / maxGain) * plotH;

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxCost);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxGain);
  const line = points.map((p) => `${x(p.costMid).toFixed(1)},${y(p.gain).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${y(0).toFixed(1)} ${line} ${x(points[points.length - 1].costMid).toFixed(1)},${y(0).toFixed(1)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-4">
        {/* Fixed W x H, not a percentage-scaled SVG: the hover tooltip below
            is positioned by percentage of this same box, which only lines
            up with the actual point once the box is the SVG's own native
            pixel size - same fix CalibrationChart already made for the
            identical reason (a scaled SVG also shrinks its baked-in font
            sizes illegibly below ~560px). The outer scroll container
            degrades to scrollable on narrow screens instead. */}
        <div className="thin-scroll w-full overflow-x-auto">
        <div className="relative mx-auto" style={{ width: W, height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block overflow-visible" role="img" aria-label="Cumulative instrumentation spend versus cumulative confidence gain, from the top station through all ten">
          <ChartTitle x={PAD_L} y={26} title="Spend versus confidence gain" subtitle="Cumulative, from the single top-ranked station through all ten" />

          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={PAD_L} x2={PAD_L + plotW} y1={y(t)} y2={y(t)} stroke={CHART.gridStroke} strokeWidth={1} />
              <text x={PAD_L - 10} y={y(t) + 4} textAnchor="end" fontFamily={CHART.monoFont} fontSize={CHART.tickFontSize} fill={CHART.tickFill}>
                {(t * 100).toFixed(0)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={x(t)} x2={x(t)} y1={PAD_T} y2={PAD_T + plotH} stroke={CHART.gridStroke} strokeWidth={1} />
              <text x={x(t)} y={PAD_T + plotH + 18} textAnchor="middle" fontFamily={CHART.monoFont} fontSize={CHART.tickFontSize} fill={CHART.tickFill}>
                {usd(t)}
              </text>
            </g>
          ))}
          <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={PAD_T + plotH} stroke={CHART.axisStroke} strokeWidth={1} />
          <line x1={PAD_L} x2={PAD_L + plotW} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke={CHART.axisStroke} strokeWidth={1} />
          <AxisTitle x={PAD_L + plotW / 2} y={H - 8}>
            Cumulative instrumentation spend (usd, midpoint of range)
          </AxisTitle>
          <AxisTitle x={18} y={PAD_T + plotH / 2} rotate>
            Cumulative confidence gain (pts)
          </AxisTitle>

          <motion.polygon
            points={area}
            fill={COLOR.inferred}
            fillOpacity={0.08}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease }}
          />
          <motion.polyline
            points={line}
            fill="none"
            stroke={COLOR.inferred}
            strokeWidth={2.25}
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DRAW_IN.duration + 0.15, ease: DRAW_IN.ease }}
          />

          {points.slice(1).map((p, i, arr) => {
            const px = x(p.costMid);
            const py = y(p.gain);
            // The last point sits near the top of the plot - the same
            // constraint the old backing-plate label had - so its
            // annotation sits below the marker while every other point's
            // sits above, keeping it clear of the chart title.
            const above = i < arr.length - 1;
            const labelY = above ? py - 14 : py + 22;
            const isActive = activeIdx === i;
            return (
              <motion.g
                key={p.label}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...VALUE_CHANGE, delay: DRAW_IN.duration + i * 0.08 }}
                style={{ transformOrigin: `${px}px ${py}px` }}
              >
                {/* minimal always-on annotation - just the gain, so the
                    curve's shape reads without hovering anything */}
                <text x={px} y={labelY} textAnchor="middle" fontFamily={CHART.monoFont} fontSize={11.5} fontWeight={700} fill={COLOR.inkPrimary}>
                  +{(p.gain * 100).toFixed(1)} pts
                </text>
                <motion.circle
                  cx={px}
                  cy={py}
                  fill={COLOR.inferred}
                  stroke={COLOR.bgDeep}
                  animate={{ r: isActive ? 8 : 6, strokeWidth: isActive ? 2.5 : 2 }}
                  transition={{ duration: 0.15, ease: DRAW_IN.ease }}
                />
                {/* hit target: bigger than the mark, keyboard-focusable, mirrors hover on focus - same pattern as Trust's CalibrationChart */}
                <circle
                  cx={px}
                  cy={py}
                  r={20}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`${p.label}: ${usd(p.costLow)} to ${usd(p.costHigh)}, +${(p.gain * 100).toFixed(1)} points confidence gain, ${p.stationCount} station${p.stationCount === 1 ? '' : 's'}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                  onFocus={() => setActiveIdx(i)}
                  onBlur={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              </motion.g>
            );
          })}
        </svg>

        <AnimatePresence>
          {activeIdx !== null && (() => {
            const active = points[activeIdx + 1];
            const activePy = y(active.gain);
            // A tooltip rendered above the point can clip against this
            // container's own top edge when the point sits close to it -
            // the "All 10 stations" point especially, since it's both the
            // highest point on the chart AND the one with the most station
            // chips, making its tooltip the tallest. Below 190px of headroom
            // (enough for the tallest realistic tooltip + the 16px gap),
            // flip to rendering below instead - the same above/below flip
            // the always-visible label already uses for the same reason.
            const renderBelow = activePy - PAD_T < 190;
            return (
            <motion.div
              key={active.label}
              className="pointer-events-none absolute z-10 min-w-[190px] rounded border border-line-strong bg-panel-raised px-3.5 py-3 shadow-raised"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.14, ease: DRAW_IN.ease }}
              style={{
                left: `${(x(active.costMid) / W) * 100}%`,
                top: `${(activePy / H) * 100}%`,
                x: '-50%',
                y: renderBelow ? '16px' : 'calc(-100% - 16px)',
                transformOrigin: renderBelow ? 'top center' : 'bottom center',
              }}
            >
              <div className="font-mono text-[12px] font-semibold text-ink-primary">{active.label}</div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-caption uppercase tracking-wider text-ink-muted">cost</span>
                <span className="font-mono text-[13px] font-bold text-ink-primary">
                  {usd(active.costLow)}-{usd(active.costHigh)}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-caption uppercase tracking-wider text-ink-muted">gain</span>
                <span className="font-mono text-[15px] font-bold text-inferred">
                  +{(active.gain * 100).toFixed(1)} pts
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {active.stationIds.map((id) => (
                  <span key={id} className="rounded border border-line-soft bg-panel-inset px-1.5 py-0.5 font-mono text-[10.5px] text-ink-secondary">
                    {id}
                  </span>
                ))}
              </div>
            </motion.div>
            );
          })()}
        </AnimatePresence>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-line-soft bg-line-soft sm:grid-cols-3">
        {tiers.map((tier) => (
          <div key={tier.label} className="flex flex-col gap-2 bg-panel p-3.5">
            <div className="flex items-baseline justify-between">
              <span className="text-caption font-bold uppercase tracking-[0.1em] text-ink-primary">{tier.label}</span>
              <span className="font-mono text-[12px] font-semibold text-inferred">
                +{(tier.totalConfidenceGain * 100).toFixed(1)} pts
              </span>
            </div>
            <span className="font-mono text-[11.5px] text-ink-secondary">
              {usd(tier.totalCostLowUsd)}-{usd(tier.totalCostHighUsd)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {tier.stationIds.map((id) => (
                <span key={id} className="rounded border border-line-soft bg-panel-inset px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">
                  {id}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
