import { PanelTitle } from '../PanelTitle';
import { calibrationRange, type CalibrationPoint } from '@/trustMetrics';

interface Props {
  points: CalibrationPoint[];
  toleranceSeconds: number;
  toleranceDerivation: string;
}

const SIZE = 340;
const PAD = 36;
const PLOT = SIZE - PAD * 2;

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/**
 * The reliability diagram, but built to answer one plain-language question
 * at a glance: when Stratify says X% confident, is it right X% of the
 * time? Axis bounds come from calibrationRange(points) — the model's real
 * operating band (validate.csv) — never an assumed 0-100% scale, which
 * would compress the only part of the chart that matters into a sliver.
 */
export function CalibrationChart({ points, toleranceSeconds, toleranceDerivation }: Props) {
  if (points.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PanelTitle title="Calibration" subtitle="Confidence vs. observed accuracy" />
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <span className="font-mono text-[11px] text-ink-muted">— no calibration data in metrics.json —</span>
        </div>
      </div>
    );
  }

  const { min, max } = calibrationRange(points);
  const span = max - min || 1;
  const toX = (v: number) => PAD + ((v - min) / span) * PLOT;
  const toY = (v: number) => SIZE - PAD - ((v - min) / span) * PLOT;

  const sorted = [...points].sort((a, b) => a.meanPredictedConfidence - b.meanPredictedConfidence);
  const maxN = Math.max(...sorted.map((p) => p.n));
  const radiusFor = (n: number) => 4 + Math.sqrt(n / maxN) * 10;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const polyline = sorted.map((p) => `${toX(p.meanPredictedConfidence).toFixed(1)},${toY(p.observedAccuracy).toFixed(1)}`).join(' ');

  const ticks = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Calibration" subtitle="Confidence vs. observed accuracy" />
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-3">
        <p className="text-[12.5px] leading-snug text-ink-secondary">
          When Stratify reports <span className="font-mono font-semibold text-ink-primary">~{pct(first.meanPredictedConfidence)}</span>{' '}
          confidence, it is right about{' '}
          <span className="font-mono font-semibold text-ink-primary">{pct(first.observedAccuracy)}</span> of the time. When it reports{' '}
          <span className="font-mono font-semibold text-ink-primary">~{pct(last.meanPredictedConfidence)}</span>, it is right about{' '}
          <span className="font-mono font-semibold text-ink-primary">{pct(last.observedAccuracy)}</span> of the time.
        </p>

        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[340px] self-center">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={toX(t)} x2={toX(t)} y1={PAD} y2={SIZE - PAD} stroke="#161D24" strokeWidth="1" />
              <line x1={PAD} x2={SIZE - PAD} y1={toY(t)} y2={toY(t)} stroke="#161D24" strokeWidth="1" />
              <text x={toX(t)} y={SIZE - PAD + 14} fontSize="9" fill="#5C6773" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">
                {pct(t)}
              </text>
              <text x={PAD - 6} y={toY(t) + 3} fontSize="9" fill="#5C6773" textAnchor="end" fontFamily="IBM Plex Mono, monospace">
                {pct(t)}
              </text>
            </g>
          ))}

          {/* perfect-calibration reference */}
          <line x1={toX(min)} y1={toY(min)} x2={toX(max)} y2={toY(max)} stroke="#5C6773" strokeWidth="1" strokeDasharray="3 3" />

          <polyline points={polyline} fill="none" stroke="#56B6E0" strokeWidth="1.5" strokeLinejoin="round" />
          {sorted.map((p) => (
            <circle
              key={`${p.confidenceBucketLow}-${p.confidenceBucketHigh}`}
              cx={toX(p.meanPredictedConfidence)}
              cy={toY(p.observedAccuracy)}
              r={radiusFor(p.n)}
              fill="#56B6E0"
              fillOpacity="0.22"
              stroke="#56B6E0"
              strokeWidth="1.5"
            />
          ))}

          <text x={SIZE / 2} y={SIZE - 4} fontSize="9.5" fill="#8A96A5" textAnchor="middle" fontFamily="IBM Plex Sans, sans-serif" fontWeight="600" letterSpacing="0.5">
            PREDICTED CONFIDENCE
          </text>
          <text
            x={12}
            y={SIZE / 2}
            fontSize="9.5"
            fill="#8A96A5"
            textAnchor="middle"
            fontFamily="IBM Plex Sans, sans-serif"
            fontWeight="600"
            letterSpacing="0.5"
            transform={`rotate(-90 12 ${SIZE / 2})`}
          >
            OBSERVED ACCURACY
          </text>
        </svg>

        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {sorted.map((p) => (
            <span key={`${p.confidenceBucketLow}-l`} className="font-mono text-[9px] tabular-nums text-ink-muted">
              {pct(p.confidenceBucketLow)}-{pct(p.confidenceBucketHigh)}: n={p.n.toLocaleString()}
            </span>
          ))}
        </div>

        <p className="border-t border-line-soft pt-2 text-[10px] leading-snug text-ink-muted">
          "Right" means the predicted cycle time was within {toleranceSeconds.toFixed(2)}s of the true value —{' '}
          {toleranceDerivation}, fixed before this run, never adjusted to flatten this curve.
        </p>
      </div>
    </div>
  );
}
