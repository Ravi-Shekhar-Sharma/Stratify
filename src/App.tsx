import { useState } from 'react';
import { useEngineTwin } from '@/useEngineTwin';
import { StatusBar } from '@/components/StatusBar';
import { ShopSection } from '@/components/ShopSection';
import { Legend } from '@/components/Legend';
import { InferenceDetail } from '@/components/InferenceDetail';
import { BufferRiskPanel } from '@/components/BufferRiskPanel';
import { EventsFeed } from '@/components/EventsFeed';
import { RecommendedAction } from '@/components/RecommendedAction';
import { Controls } from '@/components/Controls';
import { Skeleton } from '@/components/Skeleton';
import { FlowDiagram } from '@/components/FlowDiagram';
import { NAMED_BUFFERS } from '@/engine/topology';
import type { BufferViewModel, Recommendation, StationViewModel } from '@/twinTypes';

type View = 'twin' | 'flow';

function pickInferenceTarget(stations: StationViewModel[], recommendation: Recommendation): StationViewModel | null {
  if ('stationId' in recommendation) {
    const found = stations.find((s) => s.spec.id === recommendation.stationId);
    if (found) return found;
  }
  return stations.find((s) => s.state.kind === 'inferred') ?? null;
}

function App() {
  const { phase, snapshot, runIncident, reset } = useEngineTwin();
  const [view, setView] = useState<View>('twin');

  if (phase === 'connecting' || !snapshot) {
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

  const bodyStations = snapshot.stations.filter((s) => s.spec.shop === 'body');
  const paintStations = snapshot.stations.filter((s) => s.spec.shop === 'paint');
  const finalStations = snapshot.stations.filter((s) => s.spec.shop === 'final');

  const bufferById = new Map<string, BufferViewModel>(snapshot.buffers.map((b) => [b.id, b]));
  const bufferAfterStation = new Map<string, BufferViewModel>();
  for (const nb of NAMED_BUFFERS) {
    const bufView = bufferById.get(nb.id);
    if (bufView) bufferAfterStation.set(nb.downstreamOf, bufView);
  }

  const inferenceTarget = pickInferenceTarget(snapshot.stations, snapshot.recommendation);

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <ViewToggle view={view} setView={setView} />
      <StatusBar
        rateJph={snapshot.rateJph}
        phase={snapshot.phase}
        currentTick={snapshot.currentTick}
        totalTicks={snapshot.totalTicks}
        playbackMultiple={snapshot.playbackMultiple}
      />

      <div className="flex items-center justify-between border-b border-line-soft bg-bg px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">Control</span>
          <span className="font-mono text-[10px] tabular-nums text-ink-muted">
            {snapshot.phase === 'incident' ? 'incident · sequence live' : 'steady state'}
          </span>
        </div>
        <Controls onRun={runIncident} onReset={reset} incidentScheduled={snapshot.incidentScheduled} />
      </div>

      <ShopSection shop="body" stations={bodyStations} bufferAfter={bufferAfterStation} defaultExpanded={false} />
      <ShopSection shop="paint" stations={paintStations} bufferAfter={bufferAfterStation} defaultExpanded={false} />
      <ShopSection shop="final" stations={finalStations} bufferAfter={bufferAfterStation} defaultExpanded={true} />
      <div className="border-b border-line-soft bg-bg">
        <Legend />
      </div>

      <section className="grid h-[340px] gap-px bg-line-soft lg:grid-cols-3">
        <div className="h-full overflow-hidden border border-line bg-panel">
          <InferenceDetail target={inferenceTarget} />
        </div>
        <div className="h-full overflow-hidden border border-line bg-panel">
          <BufferRiskPanel history={snapshot.trimBufferHistory} secondsToEmpty={snapshot.trimBufferSecondsToEmpty} />
        </div>
        <div className="h-full overflow-hidden border border-line bg-panel">
          <EventsFeed events={snapshot.events} />
        </div>
      </section>

      <section className="px-6 py-4">
        <RecommendedAction recommendation={snapshot.recommendation} />
      </section>

      <footer className="flex items-center justify-between border-t border-line-soft px-6 py-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-ink-muted">
          stratify · 42-station twin · simulated
        </span>
        <span className="font-mono text-[9px] tabular-nums text-ink-muted">
          {snapshot.stations.length} stations · {snapshot.currentTick}/{snapshot.totalTicks}s
        </span>
      </footer>
    </div>
  );
}

function ViewToggle({ view, setView }: { view: View; setView: (v: View) => void }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-line-soft bg-bg px-6 py-2">
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-secondary">View</span>
      <ToggleButton active={view === 'twin'} onClick={() => setView('twin')} label="Twin" />
      <ToggleButton active={view === 'flow'} onClick={() => setView('flow')} label="Pipeline" />
    </div>
  );
}

function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
        active ? 'border-cyan/60 bg-cyan/10 text-cyan' : 'border-line bg-panel text-ink-secondary hover:bg-panel-raised',
      ].join(' ')}
      style={{ borderRadius: 0 }}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

export default App;
