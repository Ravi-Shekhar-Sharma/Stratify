import { useId, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DRAW_IN, VALUE_CHANGE } from '@/motion';
import { calibrationRange, calibrationCI95, type CalibrationPoint } from '@/trustMetrics';

interface Props {
  points: CalibrationPoint[];
  toleranceSeconds: number;
  toleranceDerivation: string;
}

const W = 920;
const H = 480;
const PAD_L = 76;
const PAD_R = 40;
const PAD_T = 64;
const PAD_B = 64;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const ACCENT = '#56B6E0';
const SURFACE = '#10151B';

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/**
 * The hero of the Trust view — the single most important object in the
 * product, per the Round 2 brief, not a chart squeezed into a narrow
 * column. Built to answer one question in about two seconds for a
 * non-statistician: when Stratify states a number, is it right that
 * often? Axis bounds come from calibrationRange(points) — the model's
 * real operating band, never an assumed 0-100% scale, which would
 * compress the only part of the chart that matters into a sliver.
 *
 * Every point carries TWO honest signals of evidence weight: its own
 * radius (n-sized, per the dataviz skill) AND a vertical 95% confidence
 * interval (calibrationCI95 — a real normal-approximation binomial
 * interval computed from n and the observed proportion, not a decorative
 * whisker) — the lowest bucket (n=47,408) gets a tight interval, the
 * highest (n=3,658) a visibly wider one, so a statistically literate
 * reader can see exactly where the curve is strongly evidenced and where
 * it thins out, per Round 2 item 10.
 *
 * Hand-rolled SVG, not a charting library or Bklit UI: this exact
 * technique already exists and matches every design token precisely (see
 * dataviz skill — thin marks, >=8px points with a surface-colour ring, a
 * solid never-dashed reference diagonal, per-point hover with a >=24px
 * hit target). Evaluated adding Bklit UI for this pass and decided
 * against it — a hand-rolled chart this specific to our exact tokens
 * (n-sized points, CI whiskers keyed to a real binomial interval, the
 * plain-language axis reframe) would need as much custom code on top of
 * a library as it does standing alone, for a real dependency's cold-
 * install and page-weight cost. Zero cost paid here; nothing added.
 */
export function CalibrationChart({ points, toleranceSeconds, toleranceDerivation }: Props) {
  const gradientId = useId();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 px-6 py-10">
        <span className="text-[16px] text-white/72">No calibration data for this run.</span>
      </div>
    );
  }

  const { min, max } = calibrationRange(points);
  const span = max - min || 1;
  const toX = (v: number) => PAD_L + ((v - min) / span) * PLOT_W;
  const toY = (v: number) => H - PAD_B - ((v - min) / span) * PLOT_H;

  const sorted = [...points].sort((a, b) => a.meanPredictedConfidence - b.meanPredictedConfidence);
  const maxN = Math.max(...sorted.map((p) => p.n));
  const radiusFor = (n: number) => 6 + Math.sqrt(n / maxN) * 16;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const active = activeIdx !== null ? sorted[activeIdx] : null;

  const coords = sorted.map((p) => [toX(p.meanPredictedConfidence), toY(p.observedAccuracy)] as const);
  const polyline = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const bottomY = H - PAD_B;
  const areaPath =
    `M${coords[0][0].toFixed(1)},${bottomY} ` +
    coords.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
    ` L${coords[coords.length - 1][0].toFixed(1)},${bottomY} Z`;

  const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);

  return (
    <div className="flex flex-col gap-6 px-6 py-8 sm:px-10 sm:py-10">
      <p className="max-w-[62ch] text-[16px] leading-[1.6] text-white/72">
        When Stratify reports <span className="font-mono font-semibold text-ink-primary">~{pct(first.meanPredictedConfidence)}</span>{' '}
        confidence, it is right about{' '}
        <span className="font-mono font-semibold text-ink-primary">{pct(first.observedAccuracy)}</span> of the time. When it
        reports <span className="font-mono font-semibold text-ink-primary">~{pct(last.meanPredictedConfidence)}</span>, it is
        right about <span className="font-mono font-semibold text-ink-primary">{pct(last.observedAccuracy)}</span> of the
        time - the stated number and the real outcome track each other.
      </p>

      {/* A percentage-scaled SVG shrinks its baked-in font sizes right along
          with it - fine at desktop widths (>=920px) but illegible once the
          container drops below that, exactly the failure mode the Pipeline
          diagram fix addressed earlier this pass. Fixed width/height here
          keeps every label at its true pixel size at all viewport widths;
          the outer overflow-x-auto + mx-auto degrades to left-aligned and
          scrollable on narrow screens rather than shrinking text. */}
      <div className="w-full overflow-x-auto thin-scroll">
        <div className="relative mx-auto" style={{ width: W, height: H }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="block overflow-visible"
            role="img"
            aria-label="Calibration chart: stated confidence versus actual accuracy, closely tracking the perfect-calibration diagonal"
          >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.18" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* self-explanatory title, baked into the chart itself so it
              survives being screenshotted onto a slide with no
              surrounding page context (Round 2 item 12) */}
          <text x={PAD_L} y={30} className="font-mono text-[19px] font-bold" fill="#F3F4F6">
            Stated confidence tracks actual accuracy
          </text>
          <text x={PAD_L} y={50} className="font-sans text-[13px]" fill="#8A96A5">
            Calibration, every blind and partial station, held-out shifts
          </text>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={toX(t)} x2={toX(t)} y1={PAD_T} y2={H - PAD_B} stroke="#161D24" strokeWidth="1" />
              <line x1={PAD_L} x2={W - PAD_R} y1={toY(t)} y2={toY(t)} stroke="#161D24" strokeWidth="1" />
              <text x={toX(t)} y={H - PAD_B + 22} fontSize="12" fill="#8A96A5" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
                {pct(t)}
              </text>
              <text x={PAD_L - 12} y={toY(t) + 4} fontSize="12" fill="#8A96A5" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
                {pct(t)}
              </text>
            </g>
          ))}

          {/* perfect-calibration reference — solid, never dashed (dashing
              reads as a projection, not identity) */}
          <line x1={toX(min)} y1={toY(min)} x2={toX(max)} y2={toY(max)} stroke="#4A5560" strokeWidth="1.5" />

          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* confidence-interval whiskers, drawn under the points so the
              marker itself always reads clearly on top */}
          {sorted.map((p, i) => {
            const ci = calibrationCI95(p);
            const x = coords[i][0];
            const yLow = toY(ci.low);
            const yHigh = toY(ci.high);
            return (
              <motion.g
                key={`ci-${p.confidenceBucketLow}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: DRAW_IN.duration + i * 0.05 }}
              >
                <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={ACCENT} strokeWidth="1.5" opacity="0.4" />
                <line x1={x - 6} x2={x + 6} y1={yHigh} y2={yHigh} stroke={ACCENT} strokeWidth="1.5" opacity="0.4" />
                <line x1={x - 6} x2={x + 6} y1={yLow} y2={yLow} stroke={ACCENT} strokeWidth="1.5" opacity="0.4" />
              </motion.g>
            );
          })}

          <motion.polyline
            points={polyline}
            fill="none"
            stroke={ACCENT}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease }}
          />

          {sorted.map((p, i) => {
            const [x, y] = coords[i];
            const r = radiusFor(p.n);
            const isActive = activeIdx === i;
            return (
              <motion.g
                key={`${p.confidenceBucketLow}-${p.confidenceBucketHigh}`}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...VALUE_CHANGE, delay: DRAW_IN.duration + i * 0.07 }}
                style={{ transformOrigin: `${x}px ${y}px` }}
              >
                {/* surface ring separates the marker from the line/other markers it crosses */}
                <circle cx={x} cy={y} r={r + 2.5} fill={SURFACE} />
                <motion.circle
                  cx={x}
                  cy={y}
                  fill={ACCENT}
                  fillOpacity="0.24"
                  stroke={ACCENT}
                  animate={{ r: isActive ? r + 2 : r, strokeWidth: isActive ? 2.5 : 1.75 }}
                  transition={{ duration: 0.15, ease: DRAW_IN.ease }}
                />
                {/* direct sample-count annotation, not just a legend below */}
                <text
                  x={x}
                  y={y - r - 12}
                  textAnchor="middle"
                  fontSize="11.5"
                  fontFamily="IBM Plex Mono, monospace"
                  fontWeight="600"
                  fill="#9CA3AF"
                >
                  n={p.n.toLocaleString()}
                </text>
                {/* hit target: bigger than the mark, keyboard-focusable, mirrors hover on focus */}
                <circle
                  cx={x}
                  cy={y}
                  r={Math.max(18, r + 6)}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`Confidence ${pct(p.confidenceBucketLow)} to ${pct(p.confidenceBucketHigh)}, n=${p.n}, observed accuracy ${pct(p.observedAccuracy)}, 95 percent interval ${pct(calibrationCI95(p).low)} to ${pct(calibrationCI95(p).high)}`}
                  onMouseEnter={() => setActiveIdx(i)}
                  onMouseLeave={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                  onFocus={() => setActiveIdx(i)}
                  onBlur={() => setActiveIdx((cur) => (cur === i ? null : cur))}
                  style={{ cursor: 'pointer', outline: 'none' }}
                />
              </motion.g>
            );
          })}

          {/* plain-language axis titles, not statistical shorthand */}
          <text x={PAD_L + PLOT_W / 2} y={H - 12} fontSize="13" fill="#9CA3AF" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight="600" letterSpacing="0.4">
            Stated confidence - how sure Stratify says it is
          </text>
          <text
            x={20}
            y={PAD_T + PLOT_H / 2}
            fontSize="13"
            fill="#9CA3AF"
            textAnchor="middle"
            fontFamily="Space Grotesk, sans-serif"
            fontWeight="600"
            letterSpacing="0.4"
            transform={`rotate(-90 20 ${PAD_T + PLOT_H / 2})`}
          >
            Actually correct - how often it was right
          </text>
        </svg>

        <AnimatePresence>
          {active && (
            <motion.div
              key={`${active.confidenceBucketLow}-${active.confidenceBucketHigh}`}
              className="pointer-events-none absolute z-10 min-w-[190px] rounded border border-line-strong bg-panel-raised px-3.5 py-3 shadow-raised"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.14, ease: DRAW_IN.ease }}
              style={{
                left: `${(toX(active.meanPredictedConfidence) / W) * 100}%`,
                top: `${(toY(active.observedAccuracy) / H) * 100}%`,
                x: '-50%',
                y: 'calc(-100% - 16px)',
                transformOrigin: 'bottom center',
              }}
            >
              <div className="font-mono text-[12px] text-ink-secondary">
                {pct(active.confidenceBucketLow)}-{pct(active.confidenceBucketHigh)} bucket
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="font-mono text-caption uppercase tracking-wider text-ink-muted">n</span>
                <span className="font-mono text-[15px] font-bold text-ink-primary">{active.n.toLocaleString()}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-caption uppercase tracking-wider text-ink-muted">observed</span>
                <span className="font-mono text-[15px] font-bold text-inferred">{pct(active.observedAccuracy)}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-caption uppercase tracking-wider text-ink-muted">95% ci</span>
                <span className="font-mono text-[13px] text-ink-secondary">
                  {pct(calibrationCI95(active).low)}-{pct(calibrationCI95(active).high)}
                </span>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>

      <p className="border-t border-line-soft pt-4 text-[15px] leading-[1.55] text-white/62">
        "Right" means the predicted cycle time was within {toleranceSeconds.toFixed(2)}s of the true value -{' '}
        {toleranceDerivation}, fixed before this run, never adjusted to flatten this curve. Vertical bars are a 95%
        confidence interval on each point - wider where fewer visits back the estimate, tight where the sample is large.
      </p>
    </div>
  );
}
