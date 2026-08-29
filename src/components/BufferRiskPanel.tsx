import { PanelTitle } from './PanelTitle';
import { TRIM_CHASSIS_BUFFER } from '@/engine/topology';

interface Props {
  history: number[];
  secondsToEmpty: number | null;
}

const W = 300;
const H = 80;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * The trim-to-chassis buffer's real fill history (trailing samples, from
 * the engine) and a live drain-rate estimate — not a scripted forecast.
 * This project's architecture has a forward-simulation component on its
 * roadmap (see CLAUDE.md); until that exists, this panel shows only what
 * the engine has actually observed, plus the one number a straight-line
 * extrapolation of the last two samples can honestly support.
 */
const EMPTY_EPSILON = 0.05;

export function BufferRiskPanel({ history, secondsToEmpty }: Props) {
  const capacity = TRIM_CHASSIS_BUFFER.capacity;
  const current = history.length > 0 ? history[history.length - 1] : TRIM_CHASSIS_BUFFER.nominalFill;
  // A drained buffer floors at 0 and stays flat there, which reads as "no
  // slope" to the smoothed estimator — genuinely different from "stable at
  // nominal" and worth saying so rather than reporting both as "stable."
  const empty = current <= EMPTY_EPSILON;
  const draining = !empty && secondsToEmpty !== null;
  const critical = empty || draining;

  const points =
    history.length >= 2
      ? history.map((v, i) => {
          const x = (i / (history.length - 1)) * W;
          const y = H - (v / capacity) * H;
          return [x, y] as const;
        })
      : [];
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const lineColor = critical ? '#E45B4A' : '#56B6E0';

  const headline = empty
    ? 'Empty — drained; downstream is not receiving supply from this buffer'
    : draining && secondsToEmpty !== null
      ? `Draining — empties in ~${formatDuration(secondsToEmpty)} at current rate`
      : 'Stable — inflow matches outflow';

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Buffer Risk" subtitle="Trim → Chassis" />
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        <div
          className={`flex items-start gap-2 border px-3 py-2.5 ${
            critical ? 'border-starved/50 bg-starved/10' : 'border-line bg-panel-raised'
          }`}
          style={{ borderRadius: 0 }}
        >
          <span className={`mt-1.5 h-2 w-2 shrink-0 ${critical ? 'bg-starved' : 'bg-measured'}`} />
          <p className={`text-[12.5px] font-semibold leading-snug ${critical ? 'text-starved' : 'text-ink-secondary'}`}>
            {headline}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Current fill" value={`${current.toFixed(1)} / ${capacity}`} />
          <Stat label="Nominal fill" value={`${TRIM_CHASSIS_BUFFER.nominalFill}`} />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">
              Fill level
            </span>
            <span className="font-mono text-[9px] tabular-nums text-ink-secondary">units</span>
          </div>

          {points.length > 0 ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="h-[80px] w-full" preserveAspectRatio="none">
              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#161D24" strokeWidth="1" />
              ))}
              <path d={line} fill="none" stroke={lineColor} strokeWidth="1.25" strokeLinejoin="round" />
            </svg>
          ) : (
            <div className="flex h-[80px] items-center justify-center border border-line-soft" style={{ borderRadius: 0 }}>
              <span className="font-mono text-[10px] text-ink-muted">— insufficient history yet —</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel-raised px-2.5 py-2" style={{ borderRadius: 0 }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">{label}</div>
      <div className="font-mono text-[15px] font-bold tabular-nums text-ink-primary">{value}</div>
    </div>
  );
}
