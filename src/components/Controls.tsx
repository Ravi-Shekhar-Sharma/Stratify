import { Play, RotateCcw } from 'lucide-react';

interface Props {
  onRun: () => void;
  onReset: () => void;
  runningIncident: boolean;
  disabled: boolean;
}

export function Controls({ onRun, onReset, runningIncident, disabled }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onRun}
        disabled={disabled || runningIncident}
        className="flex items-center gap-2 border border-slowing/50 bg-slowing/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-slowing transition-colors hover:bg-slowing/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-panel-raised disabled:text-ink-muted"
        style={{ borderRadius: 3 }}
        aria-label="Run incident"
      >
        <Play className="h-4 w-4" strokeWidth={2.25} />
        Run incident
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={disabled}
        className="flex items-center gap-2 border border-line bg-panel px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-primary transition-colors hover:bg-panel-raised disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderRadius: 3 }}
        aria-label="Reset to steady state"
      >
        <RotateCcw className="h-4 w-4" strokeWidth={2.25} />
        Reset
      </button>
    </div>
  );
}
