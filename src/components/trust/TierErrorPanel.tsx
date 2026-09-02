import { motion } from 'motion/react';
import { PanelTitle } from '../PanelTitle';
import { CHART, ChartTitle, AxisTitle, TIER_COLOR } from '../charts/chartKit';
import { DRAW_IN } from '@/motion';
import { COLOR } from '@/theme';
import type { ConfidenceCeilings, TierBreakdown } from '@/trustMetrics';

interface Props {
  perTier: Record<'blind' | 'partial', TierBreakdown>;
  confidenceCeilings: ConfidenceCeilings;
  /** The naive-baseline MAE (predict nominal cycle time, metrics.json's
   *  baselines.nominalCycleBaseline) — doubles as the chart's axis ceiling
   *  and as a real reference line on it, so a reader can see blind and
   *  partial error against the honest "guess the nominal cycle time"
   *  floor, not just against each other. */
  naiveBaselineMaeSeconds: number;
}

const W = 900;
const PAD_L = 96;
const PAD_R = 100;
const PAD_T = 60;
const PAD_B = 46;
const ROW_H = 56;

/**
 * Error against ground truth, by tier — the direct evidence that
 * confidence tracks available signal rather than being asserted. Sensored
 * is shown as a reference row (ground truth, not inferred — 0 error by
 * definition) to complete the story blind/partial alone can't tell.
 *
 * Rebuilt (design round 3, item 13) as one real chart with a shared,
 * labelled axis rather than three independently-styled bar rows: the
 * naive-baseline MAE is drawn as a dashed reference line on the same
 * axis, so "blind and partial land well inside the naive-guess error" is
 * a distance a reader sees on the chart, not a number they have to hold
 * in their head while reading the footnote.
 */
export function TierErrorPanel({ perTier, confidenceCeilings, naiveBaselineMaeSeconds }: Props) {
  const rows: { label: string; detail: string; mae: number; confidence: number; confidenceLabel: string; isReference: boolean }[] = [
    {
      label: 'Sensored',
      detail: 'ground truth - measured directly',
      mae: 0,
      confidence: confidenceCeilings.sensored,
      confidenceLabel: `ceiling ${(confidenceCeilings.sensored * 100).toFixed(0)}%, not empirically measured`,
      isReference: true,
    },
    {
      label: 'Partial',
      detail: `n=${perTier.partial.n.toLocaleString()} - entry/exit + one process value`,
      mae: perTier.partial.maeSeconds,
      confidence: perTier.partial.meanConfidence,
      confidenceLabel: `mean confidence, ceiling ${(confidenceCeilings.partial * 100).toFixed(0)}%`,
      isReference: false,
    },
    {
      label: 'Blind',
      detail: `n=${perTier.blind.n.toLocaleString()} - entry/exit events only`,
      mae: perTier.blind.maeSeconds,
      confidence: perTier.blind.meanConfidence,
      confidenceLabel: `mean confidence, ceiling ${(confidenceCeilings.blind * 100).toFixed(0)}%`,
      isReference: false,
    },
  ];

  const domainMax = naiveBaselineMaeSeconds * 1.18;
  const plotW = W - PAD_L - PAD_R;
  const H = PAD_T + rows.length * ROW_H + PAD_B;
  const x = (v: number) => PAD_L + (v / domainMax) * plotW;
  const ticks = [0, 0.5, 1, 1.5, 2].filter((t) => t <= domainMax);
  const axisY = PAD_T + rows.length * ROW_H + 8;
  const baselineX = x(naiveBaselineMaeSeconds);

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Soft-Sensor Error by Tier" subtitle="MAE against ground truth, held-out" />
      <div className="flex-1 overflow-auto p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ minWidth: 600 }}
          role="img"
          aria-label="Mean absolute error against ground truth by observability tier, compared with the naive nominal-cycle baseline"
        >
          <ChartTitle x={PAD_L} y={26} title="Error stays well inside the naive-guess floor" subtitle="Mean absolute error in seconds, by tier" />

          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={PAD_T - 8} y2={axisY} stroke={CHART.gridStroke} strokeWidth={1} />
              <text x={x(t)} y={axisY + 16} textAnchor="middle" fontFamily={CHART.monoFont} fontSize={CHART.tickFontSize} fill={CHART.tickFill}>
                {t.toFixed(1)}s
              </text>
            </g>
          ))}
          <line x1={PAD_L} x2={PAD_L + plotW} y1={axisY} y2={axisY} stroke={CHART.axisStroke} strokeWidth={1} />
          <AxisTitle x={PAD_L + plotW / 2} y={H - 6}>
            Mean absolute error (seconds, lower is better)
          </AxisTitle>

          {/* naive baseline reference line - the honest floor everything else is measured against */}
          <line x1={baselineX} x2={baselineX} y1={PAD_T - 4} y2={axisY} stroke={COLOR.starved} strokeWidth={1.25} strokeDasharray="4 3" opacity={0.7} />
          <text x={baselineX} y={PAD_T - 10} textAnchor="middle" fontFamily={CHART.sansFont} fontSize={10.5} fontWeight={600} fill={COLOR.starved}>
            naive baseline {naiveBaselineMaeSeconds.toFixed(2)}s
          </text>

          {rows.map((r, i) => {
            const y = PAD_T + i * ROW_H + ROW_H / 2;
            const barColor = r.isReference ? COLOR.measured : TIER_COLOR[r.label.toLowerCase() as 'partial' | 'blind'];
            const isBlind = r.label === 'Blind';
            return (
              <motion.g
                key={r.label}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease, delay: i * 0.06 }}
              >
                <text x={PAD_L - 10} y={y - 10} textAnchor="end" fontFamily={CHART.monoFont} fontSize={13} fontWeight={700} fill={COLOR.inkPrimary}>
                  {r.label}
                </text>
                <text x={PAD_L - 10} y={y + 5} textAnchor="end" fontFamily={CHART.sansFont} fontSize={10} fill={CHART.tickFill}>
                  {r.detail}
                </text>
                <motion.rect
                  x={PAD_L}
                  y={y - 10}
                  height={20}
                  rx={3}
                  fill={barColor}
                  opacity={r.isReference ? 0.9 : isBlind ? 0.45 : 0.85}
                  initial={{ width: 0 }}
                  animate={{ width: Math.max(3, x(r.mae) - PAD_L) }}
                  transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease, delay: DRAW_IN.duration * 0.3 + i * 0.06 }}
                />
                {isBlind && (
                  <rect x={PAD_L} y={y - 10} width={Math.max(3, x(r.mae) - PAD_L)} height={20} rx={3} fill="none" stroke={barColor} strokeWidth={1} opacity={0.9} />
                )}
                <text x={Math.max(PAD_L + 24, x(r.mae) + 10)} y={y + 4} fontFamily={CHART.monoFont} fontSize={12} fontWeight={600} fill={COLOR.inkPrimary}>
                  {r.isReference ? '0.00s' : `${r.mae.toFixed(2)}s`}
                </text>
                <text x={W - PAD_R + 10} y={y - 3} fontFamily={CHART.monoFont} fontSize={12} fontWeight={700} fill={COLOR.inferred}>
                  {(r.confidence * 100).toFixed(0)}%
                </text>
                <text x={W - PAD_R + 10} y={y + 11} fontFamily={CHART.sansFont} fontSize={9.5} fill={CHART.tickFill}>
                  confidence
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[15px] leading-[1.55] text-white/62">
        Blind and partial land within {Math.abs(perTier.partial.maeSeconds - perTier.blind.maeSeconds).toFixed(2)}s
        of each other and well inside the {naiveBaselineMaeSeconds.toFixed(2)}s naive-guess floor - the one extra
        process-value reading partial stations get barely moves either error or confidence, an honest finding, not
        adjusted to look more differentiated.
      </p>
    </div>
  );
}
