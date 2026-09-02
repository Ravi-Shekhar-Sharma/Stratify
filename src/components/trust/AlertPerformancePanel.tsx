import { motion } from 'motion/react';
import { PanelTitle } from '../PanelTitle';
import { CHART, ChartTitle } from '../charts/chartKit';
import { DRAW_IN } from '@/motion';
import { COLOR } from '@/theme';
import type { AlertMetricsByBand, S6S9LeadTime, SeverityBand } from '@/trustMetrics';

interface Props {
  alertBands: AlertMetricsByBand;
  leadTime: S6S9LeadTime;
}

function fmtSeconds(s: number | null): string {
  if (s === null) return '-';
  const sign = s < 0 ? '-' : '';
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = Math.round(abs % 60);
  return m > 0 ? `${sign}${m}m ${sec}s` : `${sign}${sec}s`;
}

function pct(x: number | null): string {
  return x === null ? '-' : `${(x * 100).toFixed(1)}%`;
}

const BAND_LABEL: Record<SeverityBand, string> = { easy: 'Easy (1.3-2.0x nominal)', marginal: 'Marginal (1.10-1.25x nominal)' };

const CW = 860;
const CH = 200;
const C_PAD_L = 54;
const C_PAD_R = 24;
const C_PAD_T = 44;
const C_PAD_B = 34;

/** Precision and recall for both severity bands, side by side, so the
 *  easy/marginal gap is a shape a reader sees rather than four
 *  percentages they compare by reading digits (design round 3, item 13). */
function BandComparisonChart({ alertBands }: { alertBands: AlertMetricsByBand }) {
  const groups: { label: string; easy: number; marginal: number }[] = [
    { label: 'Precision', easy: alertBands.easy.precision, marginal: alertBands.marginal.precision },
    { label: 'Recall', easy: alertBands.easy.recall, marginal: alertBands.marginal.recall },
  ];
  const plotW = CW - C_PAD_L - C_PAD_R;
  const plotH = CH - C_PAD_T - C_PAD_B;
  const groupW = plotW / groups.length;
  const barW = 46;
  const y = (v: number) => C_PAD_T + plotH - v * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${CW} ${CH}`}
      className="w-full"
      style={{ minWidth: 460 }}
      role="img"
      aria-label="Precision and recall compared between the easy and marginal severity bands"
    >
      <ChartTitle x={C_PAD_L} y={22} title="Easy vs marginal, at a glance" subtitle="Precision and recall, both severity bands" />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={C_PAD_L} x2={C_PAD_L + plotW} y1={y(t)} y2={y(t)} stroke={CHART.gridStroke} strokeWidth={1} />
          <text x={C_PAD_L - 8} y={y(t) + 4} textAnchor="end" fontFamily={CHART.monoFont} fontSize={CHART.tickFontSize} fill={CHART.tickFill}>
            {(t * 100).toFixed(0)}%
          </text>
        </g>
      ))}
      <line x1={C_PAD_L} x2={C_PAD_L} y1={C_PAD_T} y2={C_PAD_T + plotH} stroke={CHART.axisStroke} strokeWidth={1} />
      <line x1={C_PAD_L} x2={C_PAD_L + plotW} y1={C_PAD_T + plotH} y2={C_PAD_T + plotH} stroke={CHART.axisStroke} strokeWidth={1} />
      {groups.map((g, i) => {
        const cx = C_PAD_L + groupW * i + groupW / 2;
        return (
          <g key={g.label}>
            <text x={cx} y={C_PAD_T + plotH + 20} textAnchor="middle" fontFamily={CHART.sansFont} fontSize={11.5} fontWeight={600} fill={CHART.labelFill}>
              {g.label}
            </text>
            <motion.rect
              x={cx - barW - 4}
              width={barW}
              rx={2}
              fill={COLOR.inferred}
              initial={{ y: C_PAD_T + plotH, height: 0 }}
              animate={{ y: y(g.easy), height: plotH - (y(g.easy) - C_PAD_T) }}
              transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease }}
            />
            <text x={cx - barW - 4 + barW / 2} y={y(g.easy) - 6} textAnchor="middle" fontFamily={CHART.monoFont} fontSize={11} fontWeight={700} fill={COLOR.inferred}>
              {(g.easy * 100).toFixed(0)}%
            </text>
            <motion.rect
              x={cx + 4}
              width={barW}
              rx={2}
              fill={COLOR.slowing}
              initial={{ y: C_PAD_T + plotH, height: 0 }}
              animate={{ y: y(g.marginal), height: plotH - (y(g.marginal) - C_PAD_T) }}
              transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease, delay: 0.06 }}
            />
            <text x={cx + 4 + barW / 2} y={y(g.marginal) - 6} textAnchor="middle" fontFamily={CHART.monoFont} fontSize={11} fontWeight={700} fill={COLOR.slowing}>
              {(g.marginal * 100).toFixed(0)}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function AlertPerformancePanel({ alertBands, leadTime }: Props) {
  const bands: SeverityBand[] = ['easy', 'marginal'];

  return (
    <div className="flex h-full flex-col">
      {/* Shared PanelTitle, not a custom header: an earlier pass bumped
          this panel's own title to 15px since it leads with a real chart
          (BandComparisonChart) whose own baked-in title reads at 16px - but
          that made this the one panel title in the whole app off the
          standard 13px/text-caption size every other panel uses. Reverted
          for cross-tab consistency (user request); the subtitle stays
          dropped, since ALERT_MIN_HOLD/nominal-multiplier are internal
          engine parameter names a reader doesn't need. */}
      <PanelTitle title="Bottleneck Alert Performance" />
      <div className="border-b border-line-soft px-4 pb-2 pt-3">
        <BandComparisonChart alertBands={alertBands} />
        <div className="mt-1 flex items-center gap-4 px-1">
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-secondary">
            <span className="h-2 w-2 rounded-sm bg-inferred" /> Easy
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-ink-secondary">
            <span className="h-2 w-2 rounded-sm bg-slowing" /> Marginal
          </span>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-1 gap-px overflow-y-auto bg-line-soft md:grid-cols-2">
        {bands.map((band) => {
          const a = alertBands[band];
          const deliverable = leadTime.deliverable.byBand[band];
          const headroom = leadTime.physicalHeadroom.byBand[band];
          const dLt = deliverable.leadTimeConditionedOnCausalWarning;
          const hLt = headroom.leadTimeConditionedOnCausalWarning;
          const fireRateLow = (deliverable.warningFireRate ?? 1) < 0.9;

          return (
            <div key={band} className="flex flex-col gap-4 bg-panel px-4 py-4">
              <span className="text-caption font-bold uppercase tracking-[0.14em] text-ink-secondary">{BAND_LABEL[band]}</span>

              <div className="grid grid-cols-2 gap-3">
                <Stat label="Precision" value={pct(a.precision)} fraction={a.precision} />
                <Stat label="Recall" value={pct(a.recall)} fraction={a.recall} />
              </div>

              <div className="rounded border border-cyan/30 bg-cyan/5 px-3.5 py-3 shadow-panel">
                <div className="flex items-baseline justify-between">
                  <span className="text-caption font-bold uppercase tracking-[0.16em] text-inferred">Deliverable lead time</span>
                  <span className="font-mono text-[11px] text-ink-muted">n={dLt.n}</span>
                </div>
                <div className="mt-1.5 font-mono text-[22px] font-bold tabular-nums text-ink-primary">
                  {fmtSeconds(dLt.medianSeconds)}
                  <span className="ml-1.5 text-[13px] font-normal text-ink-secondary">median</span>
                </div>
                <div className="font-mono text-[12px] tabular-nums text-ink-secondary">
                  range [{fmtSeconds(dLt.minSeconds)}, {fmtSeconds(dLt.maxSeconds)}]
                </div>
                <div className={`mt-1.5 font-mono text-[12px] tabular-nums ${fireRateLow ? 'text-slowing' : 'text-ink-secondary'}`}>
                  fires on {pct(deliverable.warningFireRate)} of {deliverable.totalIncidentRuns} incidents
                  {deliverable.runsAlertNeverFired > 0 && ` (${deliverable.runsAlertNeverFired} never fired)`}
                </div>
              </div>

              <div className="rounded border border-line-soft px-3.5 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-caption font-bold uppercase tracking-[0.14em] text-ink-muted">
                    Physical headroom - not achievable live
                  </span>
                </div>
                <div className="mt-1 font-mono text-[13px] font-semibold tabular-nums text-ink-secondary">
                  {fmtSeconds(hLt.medianSeconds)}
                  <span className="ml-1.5 text-[12px] font-normal text-ink-muted">median · range [{fmtSeconds(hLt.minSeconds)}, {fmtSeconds(hLt.maxSeconds)}]</span>
                </div>
                <p className="mt-1.5 text-[15px] leading-[1.5] text-white/62">
                  Undebounced, at first crossing - a physics upper bound the live product cannot reach.
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-3">
        <p className="text-[15px] leading-[1.55] text-white/72">
          Deliverable is the alert the live product actually commits on: only counted once a prediction is
          computable, debounced the same way the Floor tile is. Physical headroom never reaches a viewer.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, fraction }: { label: string; value: string; fraction: number | null }) {
  return (
    <div className="rounded border border-line bg-panel-raised px-3 py-2.5 shadow-panel">
      <div className="text-caption font-semibold uppercase tracking-[0.14em] text-ink-secondary">{label}</div>
      <div className="font-mono text-[17px] font-bold tabular-nums text-ink-primary">{value}</div>
      {fraction !== null && (
        <div className="mt-1.5 h-1 w-full bg-panel-inset">
          <motion.div
            className="h-full bg-inferred"
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(1, Math.min(100, fraction * 100))}%` }}
            transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease }}
          />
        </div>
      )}
    </div>
  );
}
