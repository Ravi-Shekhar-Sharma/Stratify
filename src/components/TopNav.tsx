import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { STATE_TRANSITION } from '@/motion';
import type { EnginePhase } from '@/twinTypes';

export type View = 'twin' | 'flow' | 'trust' | 'ops' | 'invest';

interface NavItem {
  id: View;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'twin', label: 'Floor' },
  { id: 'flow', label: 'Pipeline' },
  { id: 'trust', label: 'Trust' },
  { id: 'ops', label: 'Plant' },
  { id: 'invest', label: 'Invest' },
];

interface Props {
  view: View;
  setView: (v: View) => void;
  phase: EnginePhase;
  playbackMultiple: number;
  currentTick: number;
  incidentScheduled: boolean;
  onRun: () => void;
  onReset: () => void;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/**
 * Full-width sticky top bar — one shell, one system, all five tabs. Replaces
 * the left sidebar so full-bleed content (the production line, in
 * particular) gets the whole viewport width, not 248px less of it. Run/
 * Reset and the live status cluster live here rather than inside the Floor
 * view because they read the same engine instance regardless of which tab
 * is open — this is global chrome, not Floor-view chrome.
 */
export function TopNav({
  view,
  setView,
  phase,
  playbackMultiple,
  currentTick,
  incidentScheduled,
  onRun,
  onReset,
}: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const incident = phase === 'incident';
  const queued = incidentScheduled && phase === 'steady';
  const statusText = phase === 'connecting' ? 'CONNECTING' : incident ? 'INCIDENT' : queued ? 'QUEUED' : 'LIVE';
  // Floor and Pipeline both read the one running engine instance live —
  // Pipeline's own rebuild renders that same incident state flowing
  // through the architecture diagram, so it needs Run/Reset and the
  // status cluster too. Trust, Plant and Invest are genuinely static
  // reports scored on held-out data with no connection to the live
  // engine at all, which is the actual distinction that matters here.
  const isLive = view === 'twin' || view === 'flow';

  return (
    <header
      // The background is always solid + blurred, never conditional on
      // scroll position — scrolled content (the hero paragraph, the giant
      // KPI numbers) was visibly ghosting through at the old bg-bg/75, and
      // there was a real bg-bg/40-with-no-blur window before the scroll
      // threshold engaged. `scrolled` still toggles the hairline border
      // only, a cosmetic nicety with no risk of letting content show through.
      // flex-wrap + min-h (not a fixed h-16) — at 390px, five nav tabs plus
      // Run/Reset plus Advisory genuinely do not fit on one 64px row; the
      // old fixed-height row just clipped the excess via the nav's own
      // overflow-x-auto, which pushed Trust/Plant/Invest and the Advisory
      // chip out of reach entirely on Floor/Pipeline (Advisory was also
      // wrongly `hidden` below `sm` — fixed below, it's a permanent
      // property of the product and must survive every width). Now the
      // nav gets its own full-width row and the status/advisory/actions
      // cluster wraps to a second row when it doesn't fit next to it.
      className={`sticky top-0 z-30 flex min-h-16 w-full flex-wrap items-center justify-between gap-y-1.5 border-b bg-bg/95 px-6 py-2 backdrop-blur-md transition-[border-color] duration-300 sm:flex-nowrap sm:px-8 sm:py-0 ${
        scrolled ? 'border-line-soft' : 'border-transparent'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3 sm:gap-10">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 bg-cyan" aria-hidden />
          <span className="hidden font-mono text-[15px] font-bold tracking-tight text-ink-primary sm:inline">
            STRATIFY
          </span>
        </div>

        <nav
          className="thin-scroll relative flex min-w-0 items-center gap-0.5 overflow-x-auto"
          aria-label="Views"
        >
          {NAV_ITEMS.map((item) => {
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                aria-pressed={active}
                className={`relative shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-offset-2 sm:px-4 ${
                  active ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active-pill"
                    // pointer-events-none is load-bearing, not cosmetic: this
                    // span's layoutId animation renders it with a transform
                    // that visually slides it from the previously-active
                    // tab's position to this one's over ~250ms, transiently
                    // overlapping whichever tabs sit between them. Without
                    // this, a click landing on that transiting pill during
                    // the slide bubbles to the ALREADY-active tab it belongs
                    // to (a no-op) instead of reaching the tab underneath —
                    // reads exactly like a dropped click on rapid switching.
                    className="pointer-events-none absolute inset-0 rounded-full bg-panel-raised"
                    transition={STATE_TRANSITION}
                  />
                )}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {/* The live status cluster and Run/Reset only mean anything on
            Floor and Pipeline — both read/drive the one running engine
            instance. Trust/Plant/Invest are static reports scored on
            held-out data; showing "LIVE" or an active Run-incident button
            next to one implied it was controllable or connected to the
            engine, which it never is. Hidden (not just disabled) there.
            Advisory/no-control-path is the one exception: it is a
            permanent property of the whole product, not a live-view-only
            fact, so it stays visible on every tab, every width. */}
        {isLive && (
        <div key="status-cluster" className="hidden items-center gap-4 sm:flex">
          {/* No AnimatePresence/exit here on purpose: mode="wait" fully
              fades the OLD label out before the new one starts fading in,
              and if the main thread is busy at that exact moment (mounting
              the live Floor view for the first time), that wait can stretch
              far past its nominal duration — this was the direct cause of
              the status pill going blank for several seconds during boot.
              Plain key-swap + fade-in only: the old label just disappears
              instantly on re-render, the new one fades in — never a gap. */}
          <motion.span
            key={statusText}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={STATE_TRANSITION}
            className={`flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${
              incident ? 'text-starved' : queued ? 'text-slowing' : 'text-measured'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                incident ? 'bg-starved animate-pulseDotCrit' : queued ? 'bg-slowing animate-pulseDot' : 'bg-measured animate-pulseDot'
              }`}
            />
            {statusText}
          </motion.span>
          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-ink-muted">
            ×{playbackMultiple.toFixed(0)}
          </span>
          <span className="h-3 w-px shrink-0 bg-line-soft" aria-hidden />
          <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-ink-muted">
            {formatElapsed(currentTick)}
          </span>
          <span className="h-3 w-px shrink-0 bg-line-soft" aria-hidden />
          <span className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
            Simulated
          </span>
        </div>
        )}

        <span
          className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan/80"
          title="Stratify recommends and never controls - there is no write path to line control anywhere in this system."
        >
          <span className="h-1.5 w-1.5 rounded-full border border-cyan/60" aria-hidden />
          <span className="sm:hidden">Advisory</span>
          <span className="hidden sm:inline">Advisory · no control path</span>
        </span>

        {isLive && (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onRun}
            disabled={incidentScheduled && phase !== 'incident'}
            className="shrink-0 rounded-full border border-slowing/40 bg-slowing/10 px-4 py-1.5 text-[12.5px] font-semibold text-slowing transition-[background-color,transform] duration-150 hover:bg-slowing/20 active:scale-[0.97] disabled:cursor-not-allowed disabled:border-line disabled:bg-panel-raised disabled:text-ink-muted disabled:active:scale-100"
          >
            {phase === 'incident' ? 'Replay incident' : queued ? 'Incident queued…' : 'Run incident'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 rounded-full border border-line bg-panel-raised px-4 py-1.5 text-[12.5px] font-semibold text-ink-primary transition-[background-color,transform] duration-150 hover:bg-panel-inset active:scale-[0.97]"
          >
            Reset
          </button>
        </div>
        )}
      </div>
    </header>
  );
}
