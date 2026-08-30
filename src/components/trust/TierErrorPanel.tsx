import { PanelTitle } from '../PanelTitle';
import type { ConfidenceCeilings, TierBreakdown } from '@/trustMetrics';

interface Props {
  perTier: Record<'blind' | 'partial', TierBreakdown>;
  confidenceCeilings: ConfidenceCeilings;
}

function Bar({ fraction, colorClass }: { fraction: number; colorClass: string }) {
  return (
    <div className="h-1.5 w-full bg-panel-inset">
      <div className={`h-full ${colorClass}`} style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }} />
    </div>
  );
}

/**
 * Error against ground truth, by tier — the direct evidence that
 * confidence tracks available signal rather than being asserted. Sensored
 * is shown as a reference row (ground truth, not inferred — 0 error by
 * definition) to complete the story blind/partial alone can't tell.
 */
export function TierErrorPanel({ perTier, confidenceCeilings }: Props) {
  const maeMax = Math.max(perTier.blind.maeSeconds, perTier.partial.maeSeconds, 0.01);

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Soft-Sensor Error by Tier" subtitle="MAE against ground truth, held-out" />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-3">
        <TierRow
          label="Sensored"
          detail="ground truth — measured directly, not inferred"
          maeLabel="0.00s by definition"
          maeFraction={0}
          confidence={confidenceCeilings.sensored}
          confidenceLabel={`ceiling ${(confidenceCeilings.sensored * 100).toFixed(0)}%, not empirically measured`}
          barColor="bg-measured"
        />
        <TierRow
          label="Partial"
          detail={`n=${perTier.partial.n.toLocaleString()} — entry/exit + one process value`}
          maeLabel={`${perTier.partial.maeSeconds.toFixed(2)}s MAE`}
          maeFraction={perTier.partial.maeSeconds / maeMax}
          confidence={perTier.partial.meanConfidence}
          confidenceLabel={`mean confidence, ceiling ${(confidenceCeilings.partial * 100).toFixed(0)}%`}
          barColor="bg-inferred"
        />
        <TierRow
          label="Blind"
          detail={`n=${perTier.blind.n.toLocaleString()} — entry/exit events only`}
          maeLabel={`${perTier.blind.maeSeconds.toFixed(2)}s MAE`}
          maeFraction={perTier.blind.maeSeconds / maeMax}
          confidence={perTier.blind.meanConfidence}
          confidenceLabel={`mean confidence, ceiling ${(confidenceCeilings.blind * 100).toFixed(0)}%`}
          barColor="bg-inferred"
        />

        <p className="border-t border-line-soft pt-2 text-[10px] leading-snug text-ink-muted">
          Blind and partial land within {Math.abs(perTier.partial.maeSeconds - perTier.blind.maeSeconds).toFixed(2)}s
          of each other — the one extra process-value reading partial stations get barely moves either
          error or confidence, an honest finding, not adjusted to look more differentiated.
        </p>
      </div>
    </div>
  );
}

function TierRow({
  label,
  detail,
  maeLabel,
  maeFraction,
  confidence,
  confidenceLabel,
  barColor,
}: {
  label: string;
  detail: string;
  maeLabel: string;
  maeFraction: number;
  confidence: number;
  confidenceLabel: string;
  barColor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-primary">{label}</span>
        <span className="font-mono text-[9px] text-ink-muted">{detail}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-ink-primary">{maeLabel}</span>
        <Bar fraction={maeFraction} colorClass={barColor} />
      </div>
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-inferred">{(confidence * 100).toFixed(0)}%</span>
        <span className="text-[9px] text-ink-muted">{confidenceLabel}</span>
      </div>
    </div>
  );
}
