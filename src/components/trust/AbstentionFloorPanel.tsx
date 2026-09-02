import type { CalibrationPoint } from '@/trustMetrics';

interface Props {
  points: CalibrationPoint[];
  confidenceFloor: number;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/**
 * The floor is sold as an integrity feature; this is what makes it a
 * demonstrated result rather than a number someone picked. The lowest
 * evidenced calibration bucket sits right at the floor's edge, and its
 * own observed accuracy undershoots the confidence it claims - real
 * evidence, not an assertion.
 */
export function AbstentionFloorPanel({ points, confidenceFloor }: Props) {
  const lowest = [...points].sort((a, b) => a.confidenceBucketLow - b.confidenceBucketLow)[0];
  if (!lowest) return null;
  const shortfallPts = (lowest.meanPredictedConfidence - lowest.observedAccuracy) * 100;

  return (
    <div className="flex flex-col gap-5 p-6 sm:p-8">
      <div>
        <h3 className="font-mono text-caption font-bold uppercase tracking-[0.16em] text-ink-secondary">
          Why the floor sits at {pct(confidenceFloor)}
        </h3>
        <p className="mt-2 max-w-[68ch] text-[15px] leading-[1.55] text-white/72">
          Not a number someone picked - the lowest evidenced confidence band, {pct(lowest.confidenceBucketLow)} to{' '}
          {pct(lowest.confidenceBucketHigh)}, already undershoots its own claim. Below this floor, the twin abstains
          and says why rather than reporting a number the calibration data itself shows is unreliable.
        </p>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded border border-line bg-panel-raised px-4 py-3.5 shadow-panel">
          <span className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-secondary">
            Lowest evidenced band
          </span>
          <span className="font-mono text-[24px] font-bold tabular-nums text-ink-primary">
            {pct(lowest.confidenceBucketLow)}-{pct(lowest.confidenceBucketHigh)}
          </span>
          <span className="font-mono text-[13px] text-ink-secondary">n={lowest.n.toLocaleString()} visits - the single largest bucket</span>
        </div>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5 rounded border border-starved/40 bg-starved/5 px-4 py-3.5 shadow-panel">
          <span className="text-caption font-semibold uppercase tracking-[0.12em] text-starved">
            Observed accuracy there
          </span>
          <span className="font-mono text-[24px] font-bold tabular-nums text-starved">{pct(lowest.observedAccuracy)}</span>
          <span className="font-mono text-[13px] text-ink-secondary">
            {shortfallPts > 0 ? `${shortfallPts.toFixed(1)} pts below its own stated confidence` : 'in line with its stated confidence'}
          </span>
        </div>
      </div>

      <p className="text-[15px] leading-[1.55] text-white/62">
        Every band evidenced below {pct(confidenceFloor)} shows the same pattern in this data: claimed confidence the
        observed outcomes do not fully back. That is the empirical case for abstaining there rather than reporting a
        number.
      </p>
    </div>
  );
}
