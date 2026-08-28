import { PanelTitle } from './ConfidenceRing';
import { AlertTriangle } from 'lucide-react';
import type { PredictionState } from '@/types';

interface Props {
  prediction: PredictionState;
}

// chart geometry
const W = 300;
const H = 80;
const PAD_L = 2;
const PAD_R = 2;
const CW = W - PAD_L - PAD_R;

const CYAN = '#56B6E0';
const RED = '#E45B4A';

export function PredictionPanel({ prediction }: Props) {
  const active = prediction.active;
  const samples = prediction.samples;
  const max = 70;
  const min = 40;

  const pts = samples.map((v, i) => {
    const x = PAD_L + (i / (samples.length - 1)) * CW;
    const y = H - ((v - min) / (max - min)) * H;
    return [x, y] as const;
  });

  // observed = first 5 points (up to "now" at index 4), predicted = last 3 (dashed)
  const obsEnd = 5;
  const obsPts = pts.slice(0, obsEnd);
  const predPts = pts.slice(obsEnd - 1); // include join point
  const obsLine = obsPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const predLine = predPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${obsLine} ${predPts.slice(1).map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${pts[pts.length - 1][0].toFixed(1)},${H} L${pts[0][0].toFixed(1)},${H} Z`;

  const nowX = pts[obsEnd - 1][0];
  const lineColor = active ? RED : CYAN;
  const fillColor = active ? RED : CYAN;

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Prediction" subtitle="Ripple forecast" />
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
        {/* headline */}
        <div
          className={[
            'flex items-start gap-2 border px-3 py-2.5 transition-colors duration-300',
            active
              ? 'border-starved/50 bg-starved/10'
              : 'border-line bg-panel-raised',
          ].join(' ')}
          style={{ borderRadius: 3 }}
        >
          {active ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-starved" />
          ) : (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-measured" />
          )}
          <p
            className={`text-[12.5px] font-semibold leading-snug ${
              active ? 'text-starved' : 'text-ink-secondary'
            }`}
          >
            {prediction.headline}
          </p>
        </div>

        {/* stats */}
        {active && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="Starve in" value={`~${prediction.minutesToStarve} min`} />
            <Stat label="Cars at risk" value={`~${prediction.carsAtRisk}`} />
          </div>
        )}

        {/* chart */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">
              Throughput
            </span>
            <span className="font-mono text-[9px] tabular-nums text-ink-secondary">JPH</span>
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="h-[80px] w-full" preserveAspectRatio="none">
            {/* faint gridlines */}
            {[0.2, 0.4, 0.6, 0.8].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#161D24" strokeWidth="1" />
            ))}
            {/* flat low-opacity fill */}
            <path d={area} fill={fillColor} fillOpacity="0.08" />
            {/* observed solid line */}
            <path d={obsLine} fill="none" stroke={lineColor} strokeWidth="1.25" strokeLinejoin="round" />
            {/* predicted dashed segment */}
            <path
              d={predLine}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.25"
              strokeDasharray="3 3"
              strokeLinejoin="round"
              opacity="0.85"
            />
            {/* vertical now marker */}
            <line x1={nowX} x2={nowX} y1="0" y2={H} stroke={lineColor} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
            <circle cx={nowX} cy={pts[obsEnd - 1][1]} r="2" fill={lineColor} />
          </svg>

          {/* axis labels */}
          <div className="mt-1 flex justify-between font-mono text-[8px] tabular-nums text-ink-muted">
            <span>-15m</span>
            <span>-10m</span>
            <span>-5m</span>
            <span>now</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line bg-panel-raised px-2.5 py-2" style={{ borderRadius: 2 }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-secondary">
        {label}
      </div>
      <div className="font-mono text-[15px] font-bold tabular-nums text-ink-primary">
        {value}
      </div>
    </div>
  );
}
