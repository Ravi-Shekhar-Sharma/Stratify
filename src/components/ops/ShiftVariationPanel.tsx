import { PanelTitle } from '../PanelTitle';
import type { ShiftVariation } from '@/opsMetrics';

interface Props {
  variation: ShiftVariation[];
}

/**
 * How much each station's recurring-bottleneck rate swings from one
 * simulated shift to the next — real min/mean/max/stdDev across the
 * held-out shifts, never a day/night calendar comparison (this engine
 * doesn't model distinct shift crews or schedules, and the copy says so).
 * Operator variation is intentionally absent: no operator identity exists
 * anywhere in this engine, so it cannot be shown without fabricating data.
 */
export function ShiftVariationPanel({ variation }: Props) {
  const scaleMax = Math.max(0.05, ...variation.map((v) => v.max));

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Shift-to-Shift Variation" subtitle={`${variation[0]?.n ?? 0} simulated shifts per station`} />
      <div className="thin-scroll flex-1 space-y-2.5 overflow-auto p-4">
        {variation.map((v) => (
          <div key={v.stationId} className="flex items-center gap-3">
            <span className="w-8 shrink-0 font-mono text-[10.5px] font-semibold text-ink-primary">{v.stationId}</span>
            <div className="relative h-3 flex-1 border border-line-soft bg-panel-inset">
              <div
                className="absolute inset-y-0 bg-starved/35"
                style={{
                  left: `${(v.min / scaleMax) * 100}%`,
                  width: `${Math.max(0.5, ((v.max - v.min) / scaleMax) * 100)}%`,
                }}
              />
              <div
                className="absolute inset-y-0 w-[2px] bg-starved"
                style={{ left: `${(v.mean / scaleMax) * 100}%` }}
              />
            </div>
            <span className="w-32 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-ink-secondary">
              mean {(v.mean * 100).toFixed(1)}% · sd {(v.stdDev * 100).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[9px] leading-snug text-ink-muted">
        Bar = min-max range of the recurring-bottleneck rate across held-out shifts; tick = mean. "Shift" means one
        full simulated run (a distinct shiftSeed), not a day or night crew — this engine models no shift schedule.
        Operator variation is not shown: no operator identity exists in this engine.
      </p>
    </div>
  );
}
