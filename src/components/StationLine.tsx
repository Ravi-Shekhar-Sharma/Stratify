import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useAnimationFrame, useReducedMotion } from 'motion/react';
import { STATE_TRANSITION, VALUE_CHANGE } from '@/motion';
import { COLOR } from '@/theme';
import { SHOP_LABEL } from '@/twinTypes';
import { NAMED_BUFFERS } from '@/engine/topology';
import { TAKT_SECONDS } from '@/engine/stations';
import type { ChoreographyAct } from '@/incidentChoreography';
import type { Shop, StationSpec } from '@/engine/types';
import type { StationDisplayState } from '@/engine/inference/stationDisplay';
import type { BufferViewModel, StationViewModel } from '@/twinTypes';

interface Props {
  stations: StationViewModel[];
  buffers: BufferViewModel[];
  rateJph: number;
  playbackMultiple: number;
  choreographyAct: ChoreographyAct;
  focalStationId: string | null;
}

type CoverageMode = 'plant' | 'stratify';

const STATION_GAP = 46;
const BUFFER_GAP = 76;
const SHOP_GAP = 50;
const MARGIN_X = 32;
const BASELINE_Y = 122;
const VB_H = 236;
const VEHICLE_MIN_TRAVERSAL = 10;
const VEHICLE_MAX_TRAVERSAL = 90;
/** Total time the Plant/Stratify sweep takes to travel the full line width —
 *  the coverage toggle's reveal, not a decorative loop. Every station's own
 *  reveal/void transition is timed off its x position against this so the
 *  sweep bar and the stations it uncovers move together. */
const SWEEP_DURATION = 1.1;
const SHORT_BUFFER_LABEL: Record<string, string> = {
  'painted-body-store': 'PAINTED BODY STORE',
  'trim-chassis-buffer': 'TRIM → CHASSIS',
};

interface StationSlot {
  x: number;
  index: number;
  station: StationViewModel;
}

interface BufferSlot {
  x: number;
  buffer: BufferViewModel;
  nominalPct: number;
}

interface ShopMark {
  shop: Shop;
  x: number;
  dividerX: number | null;
}

function buildLayout(stations: StationViewModel[], buffers: BufferViewModel[]) {
  const bufferById = new Map(buffers.map((b) => [b.id, b]));
  const bufferAfter = new Map(NAMED_BUFFERS.map((nb) => [nb.downstreamOf, nb]));

  let x = MARGIN_X;
  let prevShop: Shop | null = null;
  const stationSlots: StationSlot[] = [];
  const bufferSlots: BufferSlot[] = [];
  const shopMarks: ShopMark[] = [];

  stations.forEach((sv, index) => {
    if (prevShop !== null && sv.spec.shop !== prevShop) {
      const dividerX = x + SHOP_GAP / 2;
      x += SHOP_GAP;
      shopMarks.push({ shop: sv.spec.shop, x, dividerX });
    } else if (prevShop === null) {
      shopMarks.push({ shop: sv.spec.shop, x, dividerX: null });
    }
    prevShop = sv.spec.shop;

    stationSlots.push({ x, index, station: sv });
    x += STATION_GAP;

    const nb = bufferAfter.get(sv.spec.id);
    if (nb) {
      const bv = bufferById.get(nb.id);
      if (bv) {
        bufferSlots.push({ x, buffer: bv, nominalPct: (nb.nominalFill / nb.capacity) * 100 });
      }
      x += BUFFER_GAP;
    }
  });

  return { stationSlots, bufferSlots, shopMarks, width: x + MARGIN_X };
}

/**
 * The signature hero: a hand-drawn, real-time production line, not a row of
 * generic DOM cards. Vehicles flow continuously along the spine at a speed
 * derived from the real takt time and live rate; station nodes glow by real
 * state; the two named buffers render as literal vessels whose fill level
 * is the engine's own number. On a live incident, the view stages the
 * viewer's attention (focus, ripple, reveal, settle) instead of just
 * flipping states — see useIncidentChoreography. A degrading or inferred
 * station also draws faint lineage threads from the neighbour stations its
 * estimate was actually computed from.
 *
 * The Plant / Stratify toggle is the single clearest statement of what this
 * product is for: Plant view renders exactly what the plant's existing
 * systems can already see (sensored stations only — partial and blind go
 * dark, literal holes in the line); Stratify view fills those holes back in
 * with an inferred value and its confidence. One interaction is the whole
 * pitch.
 */
export function StationLine({ stations, buffers, rateJph, playbackMultiple, choreographyAct, focalStationId }: Props) {
  const reduceMotion = useReducedMotion();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredEl, setHoveredEl] = useState<Element | null>(null);
  const [coverageMode, setCoverageMode] = useState<CoverageMode>('stratify');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollFrac, setScrollFrac] = useState({ start: 0, span: 1 });
  const drag = useRef<{ startX: number; startScroll: number } | null>(null);

  const { stationSlots, bufferSlots, shopMarks, width } = useMemo(
    () => buildLayout(stations, buffers),
    [stations, buffers],
  );

  const pipeX0 = MARGIN_X - 16;
  const pipeX1 = width - MARGIN_X + 16;

  const traversal = useMemo(() => {
    const totalNominalSeconds = stations.reduce((sum, sv) => sum + sv.spec.nominalCycleSeconds, 0);
    const nominalRateJph = 3600 / TAKT_SECONDS;
    const rateRatio = nominalRateJph > 0 ? Math.min(1.2, Math.max(0.15, rateJph / nominalRateJph)) : 1;
    const seconds = totalNominalSeconds / Math.max(playbackMultiple, 1) / rateRatio;
    return Math.min(VEHICLE_MAX_TRAVERSAL, Math.max(VEHICLE_MIN_TRAVERSAL, seconds));
  }, [stations, rateJph, playbackMultiple]);

  const vehicleCount = Math.max(6, Math.round((pipeX1 - pipeX0) / 150));

  const focalSlot = focalStationId ? stationSlots.find((s) => s.station.spec.id === focalStationId) : undefined;
  const dimming = focalSlot !== undefined && (choreographyAct === 'focus' || choreographyAct === 'ripple' || choreographyAct === 'reveal');

  const rippleTargetX = useMemo(() => {
    if (!focalSlot) return null;
    const downstream = bufferSlots.find((b) => b.x > focalSlot.x);
    return downstream ? downstream.x : null;
  }, [focalSlot, bufferSlots]);

  const hovered = hoveredIndex !== null ? stationSlots[hoveredIndex] : undefined;

  const updateScrollFrac = () => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= 0) return;
    setScrollFrac({ start: el.scrollLeft / el.scrollWidth, span: el.clientWidth / el.scrollWidth });
  };

  useEffect(() => {
    updateScrollFrac();
  }, [width]);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    drag.current = { startX: e.clientX, startScroll: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el || !drag.current) return;
    el.scrollLeft = drag.current.startScroll - (e.clientX - drag.current.startX);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // A plain vertical mouse wheel does not pan horizontal overflow by
  // default in most browsers (only trackpad horizontal swipe or explicit
  // drag does) — without this, a desktop-mouse user scrolling the normal
  // way over the line never reaches the stations past whatever fits in the
  // first viewport-width, which is exactly the "only ~24 of 42 reachable"
  // complaint. A native, non-passive listener (not React's onWheel, which
  // React attaches passively) so preventDefault actually suppresses the
  // page's own vertical scroll while panning the line.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const nonSensoredCount = stations.filter((sv) => sv.spec.tier !== 'sensored').length;
  const [pulseToken, setPulseToken] = useState(0);

  const handleCoverageChange = (m: CoverageMode) => {
    setCoverageMode(m);
    setPulseToken((t) => t + 1);
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-line-soft bg-panel/40 px-8 py-10 shadow-panel sm:px-10">
      <div className="pointer-events-none absolute inset-0 bg-glow-cyan" aria-hidden />

      <div className="relative mb-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-mono text-caption font-bold uppercase tracking-[0.16em] text-ink-secondary">
            Production Line
          </h2>
          <span className="font-mono text-[11px] tabular-nums text-ink-muted">{stations.length} stations · 3 shops</span>
        </div>

        {/* The single clearest statement of what this product is for — the
            count is deliberately the loudest thing in the whole panel, not
            a peer of the toggle beside it. */}
        <div className="flex flex-wrap items-center justify-between gap-6 rounded-lg border border-line-soft bg-panel-inset/40 px-6 py-5">
          <CoverageToggle mode={coverageMode} onChange={handleCoverageChange} />
          <AnimatePresence mode="wait">
            <motion.div
              key={coverageMode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={STATE_TRANSITION}
              className="flex items-baseline gap-3"
            >
              <span
                className={`font-mono text-[56px] font-bold leading-none tabular-nums ${
                  coverageMode === 'plant' ? 'text-starved' : 'text-cyan'
                }`}
              >
                {nonSensoredCount}
              </span>
              <span className="flex flex-col gap-0.5 font-mono text-[12.5px] font-semibold uppercase leading-tight tracking-[0.06em] text-white/72">
                <span>of {stations.length} stations</span>
                <span>{coverageMode === 'plant' ? 'dark to the plant' : 'recovered by Stratify'}</span>
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          className="no-native-scrollbar relative overflow-x-auto pb-2 [cursor:grab] active:[cursor:grabbing]"
          style={{ WebkitMaskImage: EDGE_MASK, maskImage: EDGE_MASK }}
          onScroll={updateScrollFrac}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <svg
            width={width}
            height={VB_H}
            viewBox={`0 0 ${width} ${VB_H}`}
            role="img"
            aria-label="Live production line, 42 stations across three shops, with vehicles flowing along the conveyor and the two named buffers shown as fill vessels"
          >
            <defs>
              <pattern id="hatch-abstained" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill={COLOR.panelRaised} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={COLOR.inkFaint} strokeWidth="1.5" />
              </pattern>
            </defs>

            {/* shop dividers + labels */}
            {shopMarks.map((mark) => (
              <g key={mark.shop}>
                {mark.dividerX !== null && (
                  <line
                    x1={mark.dividerX}
                    y1={BASELINE_Y - 46}
                    x2={mark.dividerX}
                    y2={BASELINE_Y + 32}
                    stroke={COLOR.lineStrong}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <text
                  x={mark.x}
                  y={BASELINE_Y - 58}
                  className="fill-ink-muted font-sans text-[10px] font-semibold uppercase tracking-[0.14em]"
                >
                  {SHOP_LABEL[mark.shop]}
                </text>
              </g>
            ))}

            {/* the conveyor spine — a faint moving dash reads as directional flow */}
            <line
              x1={pipeX0}
              y1={BASELINE_Y}
              x2={pipeX1}
              y2={BASELINE_Y}
              stroke={COLOR.lineStrong}
              strokeWidth="3"
              strokeLinecap="round"
              opacity={0.35}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={pipeX0}
              y1={BASELINE_Y}
              x2={pipeX1}
              y2={BASELINE_Y}
              stroke={COLOR.cyan}
              strokeWidth="1.5"
              strokeDasharray="2 10"
              opacity={0.3}
              vectorEffect="non-scaling-stroke"
              className={reduceMotion ? undefined : 'animate-flowDash'}
            />

            {/* vehicles flowing at real takt / rate */}
            <VehicleFlow
              pipeX0={pipeX0}
              pipeX1={pipeX1}
              y={BASELINE_Y - 3}
              count={vehicleCount}
              traversal={traversal}
              reduceMotion={!!reduceMotion}
            />

            {/* the two named buffers — the only places stock genuinely accumulates */}
            {bufferSlots.map((slot) => (
              <BufferVessel key={slot.buffer.id} slot={slot} reduceMotion={!!reduceMotion} />
            ))}

            {/* inference-lineage threads — the mechanism itself, rendered */}
            {coverageMode === 'stratify' &&
              stationSlots.map((slot) => {
                const kind = slot.station.state.kind;
                if (kind !== 'inferred' && kind !== 'degrading') return null;
                return (
                  <LineageThreads
                    key={`lineage-${slot.station.spec.id}`}
                    slot={slot}
                    stationSlots={stationSlots}
                    reduceMotion={!!reduceMotion}
                  />
                );
              })}

            {/* incident ripple — travels from the focal station toward the buffer it starves */}
            {choreographyAct === 'ripple' && focalSlot && rippleTargetX !== null && !reduceMotion && (
              <motion.circle
                cx={focalSlot.x}
                cy={BASELINE_Y}
                r={5}
                fill="none"
                stroke={COLOR.slowing}
                strokeWidth={2}
                initial={{ cx: focalSlot.x, r: 5, opacity: 0.9 }}
                animate={{ cx: rippleTargetX, r: 16, opacity: 0 }}
                transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
              />
            )}

            {/* station nodes */}
            {stationSlots.map((slot) => (
              <StationNode
                key={slot.station.spec.id}
                x={slot.x}
                spec={slot.station.spec}
                state={slot.station.state}
                dimmed={dimming && slot.station.spec.id !== focalStationId}
                dark={coverageMode === 'plant' && slot.station.spec.tier !== 'sensored'}
                sweepDelay={((slot.x - pipeX0) / Math.max(1, pipeX1 - pipeX0)) * SWEEP_DURATION}
                onHover={(hover, el) => {
                  setHoveredIndex(hover ? slot.index : null);
                  setHoveredEl(hover ? el : null);
                }}
              />
            ))}

            {/* the Plant/Stratify sweep itself — a dramatic traveling band,
                not a cross-fade, timed to reach each station exactly when
                that station's own reveal/void transition fires above. Drawn
                last so it passes over everything it's uncovering. */}
            <AnimatePresence>
              {pulseToken > 0 && (
                <motion.rect
                  key={pulseToken}
                  y={-20}
                  width={54}
                  height={VB_H + 40}
                  fill={coverageMode === 'plant' ? COLOR.starved : COLOR.cyan}
                  style={{ filter: 'blur(22px)' }}
                  initial={{ x: pipeX0 - 60, opacity: 0.9 }}
                  animate={{ x: pipeX1, opacity: 0 }}
                  transition={{ duration: SWEEP_DURATION, ease: [0.4, 0, 0.2, 1] }}
                />
              )}
            </AnimatePresence>
          </svg>
        </div>

        {hovered && hoveredEl && <StationTooltip slot={hovered} anchorEl={hoveredEl} />}
      </div>

      <ScrollOverview start={scrollFrac.start} span={scrollFrac.span} />
    </div>
  );
}

const EDGE_MASK = 'linear-gradient(to right, transparent 0, black 28px, black calc(100% - 28px), transparent 100%)';

function ScrollOverview({ start, span }: { start: number; span: number }) {
  if (span >= 0.999) return null;
  return (
    <div className="mt-3 h-[3px] w-full overflow-hidden rounded-full bg-panel-inset" aria-hidden>
      <div
        className="h-full rounded-full bg-line-strong"
        style={{ marginLeft: `${start * 100}%`, width: `${Math.min(span, 1) * 100}%` }}
      />
    </div>
  );
}

function CoverageToggle({ mode, onChange }: { mode: CoverageMode; onChange: (m: CoverageMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Coverage view"
      className="relative flex items-center rounded-full border border-line bg-panel-inset p-0.5"
    >
      {(['plant', 'stratify'] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className={`relative rounded-full px-3 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150 ${
              active ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {active && (
              <motion.span layoutId="coverage-pill" className="absolute inset-0 rounded-full bg-panel-raised" transition={VALUE_CHANGE} />
            )}
            <span className="relative">{m === 'plant' ? 'Plant view' : 'Stratify view'}</span>
          </button>
        );
      })}
    </div>
  );
}

const TOOLTIP_W = 224;
const TOOLTIP_H = 108;
const VIEWPORT_MARGIN = 12;

/**
 * Rendered into a body-level portal at `position: fixed`, positioned from
 * the hovered node's real `getBoundingClientRect()` — not from its SVG `x`,
 * which is a coordinate in the scrollable content's own space and drifts
 * out of sync with the screen the moment the production line is scrolled.
 * That mismatch was the direct cause of tooltips drifting off-screen for
 * stations toward the right. Collision-aware: flips above/below and clamps
 * left/right against the real viewport, so it stays fully visible for
 * every station regardless of scroll position or window size.
 */
function StationTooltip({ slot, anchorEl }: { slot: StationSlot; anchorEl: Element }) {
  const { spec, state } = slot.station;
  const tierWord = spec.tier === 'sensored' ? 'Sensored' : spec.tier === 'partial' ? 'Partial' : 'Blind';
  const [pos, setPos] = useState<{ left: number; top: number; caretLeft: number; above: boolean } | null>(null);

  useEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const anchorCenterX = rect.left + rect.width / 2;
    const anchorTopY = rect.top;

    let left = anchorCenterX - TOOLTIP_W / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_W - VIEWPORT_MARGIN));

    const above = anchorTopY - TOOLTIP_H - 16 >= VIEWPORT_MARGIN;
    const top = above ? anchorTopY - TOOLTIP_H - 12 : rect.bottom + 12;

    setPos({ left, top, caretLeft: anchorCenterX - left, above });
  }, [anchorEl, slot.station.spec.id]);

  if (!pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-line bg-panel-raised px-4 py-3 shadow-overlay"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[12px] font-bold text-ink-primary">
          {spec.id} <span className="font-sans font-normal text-white/72">{spec.name}</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] uppercase tracking-[0.06em] text-white/50">
        <span>{tierWord} tier</span>
        <span className="font-mono capitalize text-white/72">{state.kind}</span>
      </div>
      <div className="mt-2 border-t border-line-soft pt-2 font-mono text-[12px] tabular-nums text-ink-primary">
        {state.kind === 'abstained' ? (
          <span className="font-sans text-[11.5px] normal-case text-white/72">{state.reason}</span>
        ) : state.kind === 'pending' ? (
          <span className="text-ink-muted">Not yet reached</span>
        ) : (
          <span>
            {state.cycleSeconds.toFixed(1)}s
            {'confidence' in state && state.confidence !== undefined && (
              <span className="ml-2 text-inferred">{(state.confidence * 100).toFixed(0)}% confidence</span>
            )}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}

function LineageThreads({
  slot,
  stationSlots,
  reduceMotion,
}: {
  slot: StationSlot;
  stationSlots: StationSlot[];
  reduceMotion: boolean;
}) {
  const neighbors = [stationSlots[slot.index - 1], stationSlots[slot.index + 1]].filter(
    (s): s is StationSlot => s !== undefined,
  );
  if (neighbors.length === 0) return null;
  const color = slot.station.state.kind === 'degrading' ? COLOR.slowing : COLOR.inferred;

  return (
    <>
      {neighbors.map((n) => {
        const midX = (n.x + slot.x) / 2;
        const path = `M${n.x},${BASELINE_Y} Q${midX},${BASELINE_Y - 26} ${slot.x},${BASELINE_Y}`;
        return (
          <g key={n.station.spec.id}>
            <path d={path} fill="none" stroke={color} strokeWidth={1} strokeDasharray="3 5" opacity={0.22} />
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={1.25}
              strokeDasharray="2 9"
              opacity={0.55}
              className={reduceMotion ? undefined : 'animate-flowDash'}
            />
          </g>
        );
      })}
    </>
  );
}

interface VehicleFlowProps {
  pipeX0: number;
  pipeX1: number;
  y: number;
  count: number;
  traversal: number;
  reduceMotion: boolean;
}

/**
 * Drives every vehicle's real SVG `x` attribute straight off a shared
 * requestAnimationFrame clock, rather than one Motion `animate()` call per
 * vehicle — Motion treats a bare `x`/`y` prop on an SVG element as the
 * transform shorthand (translateX/Y), not the positional attribute, which
 * silently defeats a keyframes-plus-negative-delay loop (every vehicle
 * collapses to the same resting transform instead of looping out of phase).
 * Mutating the attribute directly sidesteps that ambiguity entirely and
 * costs nothing extra: a handful of attribute writes a frame, no re-render.
 */
function VehicleFlow({ pipeX0, pipeX1, y, count, traversal, reduceMotion }: VehicleFlowProps) {
  const refs = useRef<(SVGRectElement | null)[]>([]);
  const span = pipeX1 - pipeX0;

  useAnimationFrame((time) => {
    if (reduceMotion) return;
    const tSec = time / 1000;
    for (let i = 0; i < count; i++) {
      const phase = i / count;
      const progress = (tSec / traversal + phase) % 1;
      refs.current[i]?.setAttribute('x', (pipeX0 + progress * span).toFixed(1));
    }
  });

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <rect
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          x={pipeX0 + (i / count) * span}
          y={y}
          width={15}
          height={6}
          rx={3}
          className="fill-white/[0.14]"
        />
      ))}
    </>
  );
}

function BufferVessel({ slot, reduceMotion }: { slot: BufferSlot; reduceMotion: boolean }) {
  const { x, buffer, nominalPct } = slot;
  const vesselW = 30;
  const vesselH = 76;
  const top = BASELINE_Y - vesselH / 2;
  const bottom = BASELINE_Y + vesselH / 2;
  const clamped = Math.max(0, Math.min(100, buffer.fillPct));
  // "Critical" reads off the fill level itself, relative to this buffer's own
  // nominal operating point — never off the raw per-tick trend sign, which
  // flips on ordinary single-vehicle noise and would flash this vessel red
  // at a perfectly healthy fill. A product whose whole pitch is "we don't
  // cry wolf" cannot let its own hero visualization cry wolf.
  const critical = clamped <= nominalPct * 0.3;
  const color = critical ? COLOR.starved : COLOR.cyan;
  const fillH = (clamped / 100) * vesselH;
  const clipId = `vessel-clip-${buffer.id}`;

  return (
    <g>
      {critical && !reduceMotion && (
        <rect
          x={x - vesselW / 2 - 6}
          y={top - 6}
          width={vesselW + 12}
          height={vesselH + 12}
          rx={12}
          fill={color}
          opacity={0.16}
          style={{ filter: 'blur(9px)' }}
        />
      )}

      <defs>
        <clipPath id={clipId}>
          <rect x={x - vesselW / 2} y={top} width={vesselW} height={vesselH} rx={9} />
        </clipPath>
      </defs>

      <rect
        x={x - vesselW / 2}
        y={top}
        width={vesselW}
        height={vesselH}
        rx={9}
        fill={COLOR.panelRaised}
        stroke={COLOR.line}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />

      <g clipPath={`url(#${clipId})`}>
        <motion.rect
          x={x - vesselW / 2}
          width={vesselW}
          fill={color}
          fillOpacity={0.55}
          initial={false}
          animate={{ y: bottom - fillH, height: fillH }}
          transition={VALUE_CHANGE}
        />
        <motion.line
          x1={x - vesselW / 2}
          x2={x + vesselW / 2}
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          initial={false}
          animate={{ y1: bottom - fillH, y2: bottom - fillH }}
          transition={VALUE_CHANGE}
        />
      </g>

      {/* nominal-fill calibration mark */}
      <line
        x1={x - vesselW / 2 - 4}
        x2={x - vesselW / 2}
        y1={bottom - (nominalPct / 100) * vesselH}
        y2={bottom - (nominalPct / 100) * vesselH}
        stroke={COLOR.inkFaint}
        strokeWidth="1.5"
        strokeDasharray="2 2"
        vectorEffect="non-scaling-stroke"
      />

      <title>{`${buffer.label}: ${clamped.toFixed(0)}% (${buffer.trend})`}</title>

      <text
        x={x}
        y={top - 10}
        textAnchor="middle"
        className="font-mono text-[10px] font-semibold tabular-nums"
        fill={critical ? COLOR.starved : COLOR.inkSecondary}
      >
        {clamped.toFixed(0)}%
      </text>
      <text
        x={x}
        y={bottom + 20}
        textAnchor="middle"
        className="fill-ink-faint font-sans text-[8px] font-semibold uppercase tracking-[0.1em]"
      >
        {SHORT_BUFFER_LABEL[buffer.id] ?? buffer.label}
      </text>
    </g>
  );
}

function calloutText(state: StationDisplayState): string | null {
  if (state.kind === 'inferred') {
    return state.confidence !== undefined ? `${(state.confidence * 100).toFixed(0)}%` : null;
  }
  if (state.kind === 'degrading') {
    const cyc = `${state.cycleSeconds.toFixed(0)}s`;
    return state.basis === 'inferred' && state.confidence !== undefined
      ? `${cyc} · ${(state.confidence * 100).toFixed(0)}%`
      : cyc;
  }
  return null;
}

interface StationNodeProps {
  x: number;
  spec: StationSpec;
  state: StationDisplayState;
  dimmed: boolean;
  dark: boolean;
  /** Seconds into the Plant/Stratify sweep this station's own reveal/void
   *  transition should fire — proportional to its position along the line,
   *  so the traveling sweep band and each station's change move together. */
  sweepDelay: number;
  onHover: (hover: boolean, el: Element | null) => void;
}

function StationNode({ x, spec, state, dimmed, dark, sweepDelay, onHover }: StationNodeProps) {
  const reduceMotion = useReducedMotion();
  const prevKind = useRef(state.kind);
  const [flashToken, setFlashToken] = useState(0);
  const isFirstRender = useRef(true);
  const arrivingDegrading = state.kind === 'degrading' && flashToken > 0;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevKind.current = state.kind;
      return;
    }
    if (prevKind.current !== state.kind) {
      prevKind.current = state.kind;
      setFlashToken((t) => t + 1);
    }
  }, [state.kind]);

  const r = state.kind === 'degrading' ? 9 : 6.5;
  const color =
    state.kind === 'measured'
      ? COLOR.measured
      : state.kind === 'inferred'
        ? COLOR.inferred
        : state.kind === 'degrading'
          ? COLOR.slowing
          : COLOR.inkFaint;

  const callout = calloutText(state);

  return (
    <motion.g
      role="img"
      aria-label={`Station ${spec.id} ${spec.name}, ${dark ? 'not visible in plant view' : state.kind}`}
      animate={{ opacity: dimmed ? 0.22 : 1 }}
      transition={{ duration: 0.5 }}
      onMouseEnter={(e) => onHover(true, e.currentTarget)}
      onMouseLeave={() => onHover(false, null)}
      style={{ cursor: 'default' }}
    >
      {/* larger, invisible hit target — the visible node stays small */}
      <rect x={x - 16} y={BASELINE_Y - 26} width={32} height={52} fill="transparent" style={{ pointerEvents: 'all' }} />

      <AnimatePresence mode="wait" initial={false}>
        {dark ? (
          // A genuine void — no dot, no state colour, nothing. This is
          // deliberately literal: it's exactly what the plant's existing
          // systems see at this position on the line, which is nothing at
          // all. The station ID label below still renders (muted), so the
          // gap reads as "this station exists, the plant just can't see
          // it," not as a layout bug.
          <motion.g key="dark" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: sweepDelay, duration: 0.3 }} />
        ) : (
          <motion.g key="lit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: sweepDelay, duration: 0.35 }}>
            {state.kind === 'pending' ? (
              <circle cx={x} cy={BASELINE_Y} r={4.5} fill="none" stroke={COLOR.lineSoft} strokeWidth="1.5" opacity={0.5} />
            ) : (
              <>
                {/* persistent soft glow for inferred / degrading */}
                {(state.kind === 'inferred' || state.kind === 'degrading') && (
                  <motion.circle
                    cx={x}
                    cy={BASELINE_Y}
                    r={r + 5}
                    fill={color}
                    initial={{ opacity: 0.2 }}
                    animate={reduceMotion ? { opacity: 0.28 } : { opacity: [0.18, 0.32, 0.18] }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ filter: 'blur(4px)' }}
                  />
                )}

                {/* idle pulse for a healthy measured station — barely-there proof of life */}
                {state.kind === 'measured' && !reduceMotion && (
                  <motion.circle
                    cx={x}
                    cy={BASELINE_Y}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    initial={{ opacity: 0.5, scale: 1 }}
                    animate={{ opacity: 0, scale: 1.8 }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}

                {/* arrival flash */}
                <AnimatePresence>
                  {flashToken > 0 && (
                    <motion.circle
                      key={flashToken}
                      cx={x}
                      cy={BASELINE_Y}
                      r={r}
                      fill={color}
                      initial={{ opacity: state.kind === 'degrading' ? 0.6 : 0.4, scale: 1 }}
                      animate={{ opacity: 0, scale: 2.4 }}
                      transition={{ duration: state.kind === 'degrading' ? 0.7 : 0.5, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )}
                </AnimatePresence>

                {state.kind === 'abstained' ? (
                  <circle
                    cx={x}
                    cy={BASELINE_Y}
                    r={r}
                    fill="url(#hatch-abstained)"
                    stroke={COLOR.lineStrong}
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : (
                  <motion.circle
                    cx={x}
                    cy={BASELINE_Y}
                    animate={
                      arrivingDegrading
                        ? { r: [r, r * 1.35, r] }
                        : state.kind === 'degrading' && !reduceMotion
                          ? { r: [r, r * 1.12, r] }
                          : { r }
                    }
                    transition={
                      arrivingDegrading
                        ? { duration: 0.5, times: [0, 0.4, 1], ease: [0.16, 1, 0.3, 1] }
                        : state.kind === 'degrading' && !reduceMotion
                          ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
                          : { duration: 0.3 }
                    }
                    fill={color}
                    stroke={COLOR.panel}
                    strokeWidth="1.5"
                  />
                )}

                {callout && (
                  <g>
                    <line
                      x1={x}
                      y1={BASELINE_Y - r - 2}
                      x2={x}
                      y2={BASELINE_Y - r - 12}
                      stroke={COLOR.lineStrong}
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                    <rect
                      x={x - (9 + callout.length * 3.7)}
                      y={BASELINE_Y - r - 34}
                      width={(9 + callout.length * 3.7) * 2}
                      height={20}
                      rx={4}
                      fill={COLOR.panelRaised}
                      stroke={COLOR.line}
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={BASELINE_Y - r - 20}
                      textAnchor="middle"
                      className="font-mono text-[12px] font-semibold tabular-nums"
                      fill={state.kind === 'degrading' ? COLOR.slowing : COLOR.inferred}
                    >
                      {callout}
                    </text>
                  </g>
                )}
              </>
            )}
          </motion.g>
        )}
      </AnimatePresence>

      <text
        x={x}
        y={BASELINE_Y + 34}
        textAnchor="middle"
        className="font-mono text-[12px] font-bold tracking-wide"
        fill={dark ? COLOR.inkFaint : state.kind === 'degrading' || state.kind === 'abstained' ? COLOR.inkPrimary : COLOR.inkSecondary}
      >
        {spec.id}
      </text>
    </motion.g>
  );
}
