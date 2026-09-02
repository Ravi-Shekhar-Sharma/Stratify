import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { VIEW_TRANSITION } from '@/motion';
import { useEngineTwin } from '@/useEngineTwin';
import { useIncidentChoreography } from '@/incidentChoreography';
import { TopNav, type View } from '@/components/TopNav';
import { ViewBackground, type BackgroundVariant } from '@/components/ViewBackground';
import { TwinHeader } from '@/components/TwinHeader';
import { HeroWireframe } from '@/components/HeroWireframe';
import { StationLine } from '@/components/StationLine';
import { Legend } from '@/components/Legend';
import { InferenceDetail } from '@/components/InferenceDetail';
import { BufferRiskPanel } from '@/components/BufferRiskPanel';
import { RecommendedAction } from '@/components/RecommendedAction';
import { PanelConnector } from '@/components/PanelConnector';
import { EventsFeed } from '@/components/EventsFeed';
import { Reveal } from '@/components/Reveal';
import { BootScene } from '@/components/BootScene';
import { Panel } from '@/components/Panel';
import { ChapterNav } from '@/components/ChapterNav';
import type { Recommendation, StationViewModel } from '@/twinTypes';

// Floor view (the default, first-paint view) ships in the main bundle;
// the other four views are real weight (charts, ML artifact JSON, extra
// panels) a judge landing cold doesn't need yet — splitting them out
// shrinks the bundle the boot sequence has to download+parse+execute
// before the first real frame can paint.
const PipelineView = lazy(() =>
  import('@/components/pipeline/PipelineView').then((m) => ({ default: m.PipelineView })),
);
const TrustView = lazy(() => import('@/components/trust/TrustView').then((m) => ({ default: m.TrustView })));
const OpsView = lazy(() => import('@/components/ops/OpsView').then((m) => ({ default: m.OpsView })));
const InvestmentView = lazy(() =>
  import('@/components/invest/InvestmentView').then((m) => ({ default: m.InvestmentView })),
);

/**
 * Prefers whatever the recommendation is already about, then any actively
 * inferred/degrading station, then falls back to any non-sensored station
 * with real data (abstained included) rather than returning null — the
 * engine almost always has SOMETHING live to show about a blind or partial
 * station, and Inference Detail should show that instead of defaulting to
 * a resting placeholder just because nothing is currently flagged urgent.
 * Only genuinely empty ticks (before any blind/partial station has even a
 * first visit) fall through to null.
 */
function pickInferenceTarget(stations: StationViewModel[], recommendation: Recommendation): StationViewModel | null {
  if ('stationId' in recommendation) {
    const found = stations.find((s) => s.spec.id === recommendation.stationId);
    if (found) return found;
  }
  const active = stations.find((s) => s.state.kind === 'inferred' || s.state.kind === 'degrading');
  if (active) return active;
  return stations.find((s) => s.spec.tier !== 'sensored' && s.state.kind !== 'pending') ?? null;
}

/** Suspense fallback for the four lazy-loaded, non-Floor views — only ever
 *  shown on a first switch into Trust/Plant/Invest/Pipeline, never on the
 *  Floor-view boot path. */
function ViewLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="font-mono text-caption uppercase tracking-[0.16em] text-ink-muted">Loading…</span>
    </div>
  );
}

function TwinView({
  snapshot,
  onNavigate,
}: {
  snapshot: NonNullable<ReturnType<typeof useEngineTwin>['snapshot']>;
  onNavigate: (view: View) => void;
}) {
  const inferenceTarget = pickInferenceTarget(snapshot.stations, snapshot.recommendation);
  const choreographyAct = useIncidentChoreography(snapshot.phase);
  const blindPartialCount = snapshot.stations.filter((sv) => sv.spec.tier !== 'sensored').length;

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      {/* Scoped to just the header + hero band, not the full scrollable
          page — sized against document height instead of the hero's own
          would leave the wireframe's rotation projected against thousands
          of px of unrelated content and read as stray diagonal lines. */}
      <div className="relative">
        <HeroWireframe />

        <TwinHeader
          stationCount={snapshot.stations.length}
          blindPartialCount={blindPartialCount}
          rateJph={snapshot.rateJph}
          phase={snapshot.phase}
          currentTick={snapshot.currentTick}
          totalTicks={snapshot.totalTicks}
        />

        <section className="relative px-6 pb-10 pt-10 sm:px-8">
          <StationLine
            stations={snapshot.stations}
            buffers={snapshot.buffers}
            rateJph={snapshot.rateJph}
            playbackMultiple={snapshot.playbackMultiple}
            choreographyAct={choreographyAct}
            focalStationId={inferenceTarget?.spec.id ?? null}
          />
          <div className="mt-5">
            <Legend />
          </div>
        </section>
      </div>

      <Reveal className="px-6 pb-3 sm:px-8">
          <span className="font-mono text-caption font-bold uppercase tracking-[0.16em] text-ink-muted">
            Cause → Effect → Action
          </span>
        </Reveal>

        <section className="grid grid-cols-1 gap-6 px-6 pb-10 sm:px-8 lg:grid-cols-[1fr_28px_1fr_28px_1fr] lg:gap-0">
          <Reveal index={0} className="h-full">
            <InferenceDetail target={inferenceTarget} />
          </Reveal>
          <PanelConnector highlight={choreographyAct === 'reveal' || choreographyAct === 'settle'} />
          <Reveal index={1} className="h-full">
            <BufferRiskPanel bufferHistory={snapshot.trimBufferHistory} secondsToEmpty={snapshot.trimBufferSecondsToEmpty} />
          </Reveal>
          <PanelConnector highlight={choreographyAct === 'reveal' || choreographyAct === 'settle'} />
          <Reveal index={2} className="h-full">
            <RecommendedAction recommendation={snapshot.recommendation} />
          </Reveal>
        </section>

        <Reveal className="px-6 pb-14 sm:px-8">
          <Panel className="h-[340px] overflow-hidden">
            <EventsFeed events={snapshot.events} currentTick={snapshot.currentTick} />
          </Panel>
        </Reveal>

        <ChapterNav
          targetView="flow"
          targetLabel="Pipeline"
          description="how the signal becomes an estimate"
          onNavigate={onNavigate}
        />
    </div>
  );
}

function App() {
  const { phase, snapshot, runIncident, reset } = useEngineTwin();
  const [view, setView] = useState<View>('twin');

  // Every view change lands at the top of the new view — without this, a
  // switch from a scrolled-down Floor to Plant landed mid-heatmap with its
  // own header off-screen. `behavior: 'auto'` (not smooth) on purpose: the
  // jump should be instant, hidden inside the cross-fade, not a visible
  // scroll animation racing the content transition.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [view]);

  const connecting = phase === 'connecting' || !snapshot;
  // Boot (BootScene) and live (TwinView) share ONE key ('twin') rather than
  // getting distinct 'connecting'/'twin' keys. AnimatePresence's mode="wait"
  // below fully exits the old keyed element (fading it to opacity 0) BEFORE
  // mounting the new one — for any other pair of keys that's an acceptable
  // 250ms crossfade, but for boot->live it produced a real blank frame
  // (verified: everything, including the always-rendered TopNav content,
  // reads as briefly gone). Keeping the key identical means this specific
  // swap is a plain React re-render inside the same motion.div, never
  // entering the exit/enter machinery at all — so there is no opacity dip,
  // ever, no matter how long the engine takes to leave 'connecting'.
  const renderKey = view !== 'twin' ? view : 'twin';

  // Floor (twin/boot) has its own flagship HeroWireframe and never gets
  // this ambient pattern; the other four tabs each get their own variant.
  const BACKGROUND_VARIANT: Partial<Record<View, BackgroundVariant>> = {
    trust: 'trust',
    ops: 'plant',
    invest: 'invest',
    flow: 'pipeline',
  };
  const backgroundVariant = BACKGROUND_VARIANT[view];

  let content: React.ReactNode;
  if (view === 'trust') content = <TrustView onNavigate={setView} />;
  else if (view === 'ops') content = <OpsView onNavigate={setView} />;
  else if (view === 'invest') content = <InvestmentView />;
  // Pipeline reads the same live snapshot Floor does but handles a null
  // snapshot gracefully on its own (pending counts, no incident path lit)
  // rather than needing Floor's BootScene — checked before `connecting` so
  // visiting Pipeline during the engine's brief boot window never bounces
  // through Floor-specific boot UI.
  else if (view === 'flow') content = <PipelineView snapshot={snapshot} onNavigate={setView} />;
  else if (connecting) content = <BootScene />;
  else content = <TwinView snapshot={snapshot} onNavigate={setView} />;

  return (
    // reducedMotion="user" makes every motion.div/AnimatePresence in this
    // tree honour prefers-reduced-motion automatically (springs and
    // transform-based motion collapse to instant/cross-fade); the one
    // exception is the imperative animate() calls in AnimatedNumber and
    // FalseAlarmCallout, which check useReducedMotion() themselves since
    // MotionConfig only governs the declarative component tree.
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-bg text-ink-primary">
        {/* Rendered here, not inside the per-view component, and not inside
            the motion.div below: this is a sibling of both, so its
            `position: fixed` canvas is never a descendant of that
            transformed element and stays genuinely viewport-relative. See
            ViewBackground.tsx for why nesting it deeper broke `fixed`. */}
        {backgroundVariant && <ViewBackground variant={backgroundVariant} />}
        <TopNav
          view={view}
          setView={setView}
          phase={phase}
          playbackMultiple={snapshot?.playbackMultiple ?? 1}
          currentTick={snapshot?.currentTick ?? 0}
          incidentScheduled={snapshot?.incidentScheduled ?? false}
          onRun={runIncident}
          onReset={reset}
        />
        <main className="w-full">
          {/* No AnimatePresence/exit here, deliberately — the same lesson as
              the boot-sequence fix: mode="wait" fully fades the OLD view to
              opacity 0 and unmounts it before the new one is allowed to
              start entering, and if the new view is heavy to mount (Trust's
              charts, Floor's 42-station line), that gap can stretch well
              past its nominal 250ms into a real blank frame — reported and
              fixed once already for boot, and this is the same failure
              mode for every other tab switch. A plain keyed swap: the old
              view disappears the instant React commits the new one, and
              the new view fades and settles in immediately — there is
              never a frame with nothing painted. The nav's own
              layoutId-driven active pill (see TopNav.tsx) already glides
              between items, so the pill motion plus this fade read as one
              continuous transition without needing overlapping exits. */}
          <motion.div
            key={renderKey}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={VIEW_TRANSITION}
          >
            <Suspense fallback={<ViewLoading />}>{content}</Suspense>
          </motion.div>
        </main>
      </div>
    </MotionConfig>
  );
}

export default App;
