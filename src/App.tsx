import { useEffect, useState } from 'react';
import { useTwinState } from '@/useTwinState';
import { StatusBar } from '@/components/StatusBar';
import { StationRow } from '@/components/StationRow';
import { Legend } from '@/components/Legend';
import { ConfidenceRing } from '@/components/ConfidenceRing';
import { PredictionPanel } from '@/components/PredictionPanel';
import { EventsFeed } from '@/components/EventsFeed';
import { RecommendedAction } from '@/components/RecommendedAction';
import { Controls } from '@/components/Controls';
import { Skeleton } from '@/components/Skeleton';
import { FlowDiagram } from '@/components/FlowDiagram';

type View = 'twin' | 'flow';

function App() {
  const { state, connect, reset, runIncident } = useTwinState();
  const [view, setView] = useState<View>('twin');

  useEffect(() => {
    if (state.phase !== 'connecting') return;
    const t = setTimeout(connect, 1500);
    return () => clearTimeout(t);
  }, [state.phase, connect]);

  if (state.phase === 'connecting') {
    return (
      <div className="min-h-screen bg-bg">
        <Skeleton />
      </div>
    );
  }

  if (view === 'flow') {
    return (
      <div className="min-h-screen bg-bg text-ink-primary">
        <ViewToggle view={view} setView={setView} />
        <FlowDiagram />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <ViewToggle view={view} setView={setView} />
      <StatusBar
        rateJph={state.rateJph}
        ftt={state.ftt}
        pill={state.incidentPill}
        phase={state.phase}
      />

      {/* Controls row */}
      <div className="flex items-center justify-between border-b border-line-soft bg-bg px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">
            Control
          </span>
          <span className="font-mono text-[10px] tabular-nums text-ink-muted">
            {state.phase === 'incident' ? 'incident · sequence live' : 'steady state'}
          </span>
        </div>
        <Controls
          onRun={runIncident}
          onReset={reset}
          runningIncident={state.runningIncident}
          disabled={false}
        />
      </div>

      {/* Station row + legend — more size and weight than lower panels */}
      <section className="border-b border-line-soft bg-bg">
        <SectionLabel>Stations · Line A</SectionLabel>
        <StationRow
          stations={state.stations}
          bufferFills={state.bufferFills}
          bufferLevels={state.bufferLevels}
          rippleStations={state.rippleStations}
          rippleActive={state.rippleActive}
        />
        <Legend />
      </section>

      {/* Three panels */}
      <section className="grid gap-px bg-line-soft lg:grid-cols-3">
        <div className="border border-line bg-panel" style={{ borderRadius: 3 }}>
          <ConfidenceRing
            confidence={state.s6Confidence}
            cycle={state.s6Cycle}
            active={state.phase === 'incident'}
          />
        </div>
        <div className="border border-line bg-panel" style={{ borderRadius: 3 }}>
          <PredictionPanel prediction={state.prediction} />
        </div>
        <div className="border border-line bg-panel" style={{ borderRadius: 3 }}>
          <EventsFeed events={state.events} />
        </div>
      </section>

      {/* Recommended action */}
      <section className="px-6 py-4">
        <RecommendedAction reco={state.recommendation} />
      </section>

      {/* Footer */}
      <footer className="flex items-center justify-between border-t border-line-soft px-6 py-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
          stratify · final assembly twin · prototype
        </span>
        <span className="font-mono text-[9px] tabular-nums text-ink-muted">
          takt 58s · {state.rateJph.toFixed(0)} jph
        </span>
      </footer>
    </div>
  );
}

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-line-soft bg-bg px-6 py-2">
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">
        View
      </span>
      <ToggleButton active={view === 'twin'} onClick={() => setView('twin')} label="Twin" />
      <ToggleButton active={view === 'flow'} onClick={() => setView('flow')} label="Pipeline" />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
        active
          ? 'border-cyan/60 bg-cyan/10 text-cyan'
          : 'border-line bg-panel text-ink-secondary hover:bg-panel-raised',
      ].join(' ')}
      style={{ borderRadius: 3 }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-6 pt-3">
      <span className="h-3 w-0.5 bg-cyan" />
      <h2 className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-secondary">
        {children}
      </h2>
    </div>
  );
}

export default App;
