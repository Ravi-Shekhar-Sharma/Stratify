interface Props {
  onRun: () => void;
  onReset: () => void;
  incidentScheduled: boolean;
}

export function Controls({ onRun, onReset, incidentScheduled }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onRun}
        disabled={incidentScheduled}
        className="border border-slowing/50 bg-slowing/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-slowing transition-colors hover:bg-slowing/20 disabled:cursor-not-allowed disabled:border-line disabled:bg-panel-raised disabled:text-ink-muted"
        style={{ borderRadius: 0 }}
        aria-label="Run demo incident"
      >
        Run incident
      </button>
      <button
        type="button"
        onClick={onReset}
        className="border border-line bg-panel px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-primary transition-colors hover:bg-panel-raised"
        style={{ borderRadius: 0 }}
        aria-label="Reset to steady state"
      >
        Reset
      </button>
    </div>
  );
}
