import { useMemo, useRef } from 'react';
import { motion, AnimatePresence, useAnimationFrame, useReducedMotion } from 'motion/react';
import { Panel } from '../Panel';
import { ViewHero } from '../ViewHero';
import { Reveal } from '../Reveal';
import { ChapterNav } from '../ChapterNav';
import { COLOR } from '@/theme';
import { STATIONS } from '@/engine/stations';
import { NAMED_BUFFERS } from '@/engine/topology';
import type { TwinSnapshot } from '@/twinTypes';
import type { View } from '../TopNav';

interface Props {
  snapshot: TwinSnapshot | null;
  onNavigate: (view: View) => void;
}

const SENSORED_COUNT = STATIONS.filter((s) => s.tier === 'sensored').length;
const BLIND_COUNT = STATIONS.length - SENSORED_COUNT;

/**
 * The Pipeline view: not a static flowchart but the mechanism itself, drawn
 * — the same live engine instance Floor reads, rendered as the architecture
 * that produces Floor's numbers rather than the numbers themselves. Every
 * count on this diagram is real (station tiers from src/engine/stations.ts,
 * live event/buffer state from the same snapshot Floor renders); the two
 * stages this codebase doesn't actually implement yet (defect correlation)
 * are drawn honestly inert rather than faked live.
 */
export function PipelineView({ snapshot, onNavigate }: Props) {
  const sensoredCount = snapshot ? snapshot.stations.filter((s) => s.spec.tier === 'sensored').length : SENSORED_COUNT;
  const blindCount = snapshot ? snapshot.stations.length - sensoredCount : BLIND_COUNT;
  const recentEvents = snapshot?.events.length ?? 0;
  const incidentActive = snapshot?.phase === 'incident';
  const bufferDraining = (snapshot?.trimBufferSecondsToEmpty ?? null) !== null;

  return (
    <div className="min-h-screen bg-bg text-ink-primary">
      <div className="relative z-10">
        <ViewHero
          eyebrow="Pipeline"
          headline="The signals already exist in the plant. Nothing new to install."
          subtitle="Barcode and RFID scans, Andon pulls and line-stop codes, buffer levels where buffers genuinely exist - all of it already lives in the MES. This is the mechanism that turns that timing into a confidence-scored twin state."
          proofs={[
            { value: 3, label: 'Signal classes already in the plant', tone: 'text-cyan' },
            { value: 0, label: 'New sensors required to read them', tone: 'text-measured' },
            { value: STATIONS.length, suffix: `of ${STATIONS.length}`, label: 'Stations reached by timing and event signals alone', tone: 'text-inferred' },
          ]}
        />

        <Reveal className="px-6 pb-14 pt-8 sm:px-8">
          <Panel elevation="raised" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-6 py-5">
              <div>
                <h2 className="font-mono text-caption font-bold uppercase tracking-[0.16em] text-ink-secondary">
                  Signal Architecture
                </h2>
                <p className="mt-1 text-[15px] leading-[1.5] text-white/72">
                  Timing, event and occupancy signals converge, split by what a station can actually report, and
                  resolve to one instruction.
                </p>
              </div>
              <AnimatePresence mode="wait">
                <motion.span
                  key={incidentActive ? 'incident' : 'nominal'}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.25 }}
                  className={`flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${
                    incidentActive ? 'text-slowing' : 'text-measured'
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${incidentActive ? 'bg-slowing animate-pulseDot' : 'bg-measured animate-pulseDot'}`} />
                  {incidentActive ? 'Incident path highlighted' : 'Nominal - all paths steady'}
                </motion.span>
              </AnimatePresence>
            </div>
            <Diagram
              sensoredCount={sensoredCount}
              blindCount={blindCount}
              recentEvents={recentEvents}
              bufferCount={NAMED_BUFFERS.length}
              secondsToEmpty={snapshot?.trimBufferSecondsToEmpty ?? null}
              recommendation={snapshot?.recommendation ?? null}
              incidentActive={!!incidentActive}
              bufferDraining={bufferDraining}
            />
          </Panel>
        </Reveal>

        <ChapterNav targetView="trust" targetLabel="Trust" description="whether to believe it" onNavigate={onNavigate} />
      </div>
    </div>
  );
}

// ---- diagram geometry -------------------------------------------------

type NodeId = 'timing' | 'event' | 'occupancy' | 'ingest' | 'groundtruth' | 'sensored' | 'blind' | 'twin' | 'forward' | 'defect' | 'action';

interface Pt {
  x: number;
  y: number;
}

const W = 1180;
const COL_L = 340;
const COL_C = 620;
const COL_R = 900;
// Narrower and further left than COL_L's node width would otherwise
// allow, specifically so its box never overlaps Sensored's — the two are
// deliberately close (adjacency IS the point: sensored readings are
// ground truth) but must never visually collide.
const COL_GT = 90;

const Y_ENTRY = 70;
const Y_INGEST = 220;
const Y_BRANCH1 = 400;
const Y_GT = 400;
const Y_TWIN = 580;
const Y_BRANCH2 = 760;
const Y_ACTION = 920;

const NODE_POS: Record<NodeId, Pt> = {
  timing: { x: COL_L, y: Y_ENTRY },
  event: { x: COL_C, y: Y_ENTRY },
  occupancy: { x: COL_R, y: Y_ENTRY },
  ingest: { x: COL_C, y: Y_INGEST },
  groundtruth: { x: COL_GT, y: Y_GT },
  sensored: { x: COL_L, y: Y_BRANCH1 },
  blind: { x: COL_R, y: Y_BRANCH1 },
  twin: { x: COL_C, y: Y_TWIN },
  forward: { x: COL_L, y: Y_BRANCH2 },
  defect: { x: COL_R, y: Y_BRANCH2 },
  action: { x: COL_C, y: Y_ACTION },
};

/** Orthogonal waypoint routes between nodes — precomputed, not sampled from
 *  an SVG path, so a pulse's position along the route is plain arithmetic. */
function route(a: NodeId, b: NodeId, midY?: number): Pt[] {
  const pa = NODE_POS[a];
  const pb = NODE_POS[b];
  if (pa.x === pb.x) return [pa, pb];
  const my = midY ?? (pa.y + pb.y) / 2;
  return [pa, { x: pa.x, y: my }, { x: pb.x, y: my }, pb];
}

const CONNECTORS: { id: string; from: NodeId; to: NodeId; waypoints: Pt[]; weight: 'main' | 'branch' }[] = [
  { id: 'timing-ingest', from: 'timing', to: 'ingest', waypoints: route('timing', 'ingest'), weight: 'main' },
  { id: 'event-ingest', from: 'event', to: 'ingest', waypoints: route('event', 'ingest'), weight: 'main' },
  { id: 'occupancy-ingest', from: 'occupancy', to: 'ingest', waypoints: route('occupancy', 'ingest'), weight: 'main' },
  { id: 'ingest-sensored', from: 'ingest', to: 'sensored', waypoints: route('ingest', 'sensored', 300), weight: 'branch' },
  { id: 'ingest-blind', from: 'ingest', to: 'blind', waypoints: route('ingest', 'blind', 300), weight: 'branch' },
  { id: 'sensored-groundtruth', from: 'sensored', to: 'groundtruth', waypoints: [NODE_POS.sensored, NODE_POS.groundtruth], weight: 'branch' },
  { id: 'sensored-twin', from: 'sensored', to: 'twin', waypoints: route('sensored', 'twin', 480), weight: 'main' },
  { id: 'blind-twin', from: 'blind', to: 'twin', waypoints: route('blind', 'twin', 480), weight: 'main' },
  { id: 'twin-forward', from: 'twin', to: 'forward', waypoints: route('twin', 'forward', 660), weight: 'branch' },
  { id: 'twin-defect', from: 'twin', to: 'defect', waypoints: route('twin', 'defect', 660), weight: 'branch' },
  { id: 'forward-action', from: 'forward', to: 'action', waypoints: route('forward', 'action', 840), weight: 'main' },
  { id: 'defect-action', from: 'defect', to: 'action', waypoints: route('defect', 'action', 840), weight: 'main' },
];

function pathD(pts: Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

function segmentLengths(pts: Pt[]): { lengths: number[]; total: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    lengths.push(d);
    total += d;
  }
  return { lengths, total };
}

function pointAtT(pts: Pt[], lengths: number[], total: number, t: number): Pt {
  let target = t * total;
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i] || i === lengths.length - 1) {
      const frac = lengths[i] > 0 ? Math.min(1, target / lengths[i]) : 0;
      const a = pts[i];
      const b = pts[i + 1];
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    }
    target -= lengths[i];
  }
  return pts[pts.length - 1];
}

interface DiagramProps {
  sensoredCount: number;
  blindCount: number;
  recentEvents: number;
  bufferCount: number;
  secondsToEmpty: number | null;
  recommendation: TwinSnapshot['recommendation'] | null;
  incidentActive: boolean;
  bufferDraining: boolean;
}

function fmtSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function Diagram({
  sensoredCount,
  blindCount,
  recentEvents,
  bufferCount,
  secondsToEmpty,
  recommendation,
  incidentActive,
  bufferDraining,
}: DiagramProps) {
  // The causal chain a live incident actually travels: an Andon/event
  // signal at the blind station, through the blind branch (never
  // sensored — S6 in the shipped demo genuinely is blind), into twin
  // state, into forward simulation (the buffer risk that's actually
  // draining), and out to the recommendation. Occupancy joins only once
  // the buffer is genuinely draining — lighting it up on the incident
  // alone, before any real drain, would be exactly the false-alarm
  // dishonesty this product sells against not doing.
  const activeNodes = useMemo<Set<NodeId>>(() => {
    if (!incidentActive) return new Set();
    const s = new Set<NodeId>(['event', 'ingest', 'blind', 'twin', 'forward', 'action']);
    if (bufferDraining) s.add('occupancy');
    return s;
  }, [incidentActive, bufferDraining]);

  const recLabel =
    !recommendation || recommendation.kind === 'nominal'
      ? 'Nominal - no action pending'
      : recommendation.kind === 'degrading'
        ? `${recommendation.stationId} - cycle time degrading`
        : `${recommendation.stationId} - confidence below floor`;

  return (
    // px-6/sm:px-8 matches the header row above exactly (it used to be
    // p-6/sm:p-8, an 8px mismatch against the header's own px-6/sm:px-8
    // that read as the whole diagram drifting off the header's left
    // edge). mx-auto on the SVG itself centers it whenever the panel is
    // wider than the diagram's own fixed width, and safely degrades to
    // left-aligned + scrollable (never content lost off-screen) whenever
    // the panel is narrower — the standard auto-margin behavior, not a
    // flex justify-center, which would make the scrolled-past content
    // unreachable.
    <div className="thin-scroll overflow-x-auto px-6 py-6 sm:px-8 sm:py-8">
      <svg
        width={W}
        height={Y_ACTION + 90}
        viewBox={`0 0 ${W} ${Y_ACTION + 90}`}
        role="img"
        aria-label="Live pipeline architecture: timing, event and occupancy signals converge, split into sensored and inferred branches, merge into twin state, feed forward simulation, and resolve to one recommendation"
        className="mx-auto block min-w-[880px]"
      >
        {CONNECTORS.map((c) => (
          <FlowConnector
            key={c.id}
            waypoints={c.waypoints}
            weight={c.weight}
            active={activeNodes.has(c.from) && activeNodes.has(c.to)}
          />
        ))}

        <EntryNode pos={NODE_POS.timing} label="Timing" detail={`${STATIONS.length} stations · entry/exit scans`} active={activeNodes.has('timing')} />
        <EntryNode pos={NODE_POS.event} label="Event" detail={`${recentEvents} tracked recently`} active={activeNodes.has('event')} />
        <EntryNode pos={NODE_POS.occupancy} label="Occupancy" detail={`${bufferCount} named buffers`} active={activeNodes.has('occupancy')} />

        <MergeNode pos={NODE_POS.ingest} label="Signal Ingestion" detail="Barcode, RFID, Andon, MES - already there" active={activeNodes.has('ingest')} />

        <GroundTruthNode pos={NODE_POS.groundtruth} />

        <BranchNode
          pos={NODE_POS.sensored}
          side="left"
          label="Sensored"
          detail={`${sensoredCount} of ${STATIONS.length} stations · direct reading`}
          active={activeNodes.has('sensored')}
          tone="measured"
        />
        <BranchNode
          pos={NODE_POS.blind}
          side="right"
          label="Blind + Partial"
          detail={`${blindCount} of ${STATIONS.length} stations · soft-sensor inference`}
          active={activeNodes.has('blind')}
          tone="inferred"
          caption="Reads neighbour timing only - structurally cannot reach ground truth"
        />

        <MergeNode pos={NODE_POS.twin} label="Live Twin State" detail={`${STATIONS.length} stations, one confidence score each`} active={activeNodes.has('twin')} main />

        <BranchNode
          pos={NODE_POS.forward}
          side="left"
          label="Forward Simulation"
          detail={secondsToEmpty !== null ? `${fmtSeconds(secondsToEmpty)} to buffer empty, projected` : 'Buffers stable - no drain projected'}
          active={activeNodes.has('forward')}
          tone="cyan"
        />
        <BranchNode
          pos={NODE_POS.defect}
          side="right"
          label="Defect Correlation"
          detail="Not yet wired to a live signal"
          active={false}
          tone="muted"
          inert
        />

        <TerminalNode pos={NODE_POS.action} label={recLabel} active={activeNodes.has('action')} />
      </svg>
    </div>
  );
}

// ---- node primitives ----------------------------------------------------

function EntryNode({ pos, label, detail, active }: { pos: Pt; label: string; detail: string; active: boolean }) {
  const w = 220;
  const h = 64;
  return (
    <g transform={`translate(${pos.x - w / 2}, ${pos.y - h / 2})`}>
      <rect
        width={w}
        height={h}
        rx={12}
        fill={COLOR.panelRaised}
        stroke={active ? COLOR.slowing : COLOR.line}
        strokeWidth={active ? 1.5 : 1}
      />
      <text x={16} y={26} className="font-mono text-[12px] font-bold uppercase tracking-[0.1em]" fill={active ? COLOR.slowing : COLOR.inkSecondary}>
        {label}
      </text>
      <text x={16} y={46} className="font-sans text-[12px]" fill={COLOR.inkMuted}>
        {detail}
      </text>
    </g>
  );
}

function MergeNode({ pos, label, detail, active, main }: { pos: Pt; label: string; detail: string; active: boolean; main?: boolean }) {
  const w = main ? 420 : 320;
  const h = main ? 76 : 60;
  return (
    <g transform={`translate(${pos.x - w / 2}, ${pos.y - h / 2})`}>
      <rect
        width={w}
        height={h}
        rx={14}
        fill={COLOR.panel}
        stroke={active ? COLOR.slowing : COLOR.lineStrong}
        strokeWidth={active ? 2 : 1.5}
      />
      <text x={w / 2} y={main ? 32 : 26} textAnchor="middle" className={`font-mono ${main ? 'text-[16px]' : 'text-[13px]'} font-bold uppercase tracking-[0.1em]`} fill={active ? COLOR.slowing : COLOR.inkPrimary}>
        {label}
      </text>
      <text x={w / 2} y={main ? 54 : 44} textAnchor="middle" className="font-sans text-[12.5px]" fill={COLOR.inkSecondary}>
        {detail}
      </text>
    </g>
  );
}

function BranchNode({
  pos,
  side,
  label,
  detail,
  active,
  tone,
  inert,
  caption,
}: {
  pos: Pt;
  side: 'left' | 'right';
  label: string;
  detail: string;
  active: boolean;
  tone: 'measured' | 'inferred' | 'cyan' | 'muted';
  inert?: boolean;
  caption?: string;
}) {
  const w = 260;
  const h = 68;
  const toneColor = tone === 'measured' ? COLOR.measured : tone === 'inferred' ? COLOR.inferred : tone === 'cyan' ? COLOR.cyan : COLOR.inkFaint;
  return (
    <g transform={`translate(${pos.x - w / 2}, ${pos.y - h / 2})`}>
      <rect
        width={w}
        height={h}
        rx={10}
        fill={COLOR.panelRaised}
        stroke={active ? COLOR.slowing : inert ? COLOR.lineSoft : `${toneColor}55`}
        strokeWidth={active ? 1.5 : 1}
        strokeDasharray={inert ? '4 4' : undefined}
        opacity={inert ? 0.6 : 1}
      />
      <text
        x={side === 'left' ? 16 : w - 16}
        y={26}
        textAnchor={side === 'left' ? 'start' : 'end'}
        className="font-mono text-[12px] font-bold uppercase tracking-[0.08em]"
        fill={active ? COLOR.slowing : inert ? COLOR.inkMuted : toneColor}
      >
        {label}
      </text>
      <text
        x={side === 'left' ? 16 : w - 16}
        y={46}
        textAnchor={side === 'left' ? 'start' : 'end'}
        className="font-sans text-[11.5px]"
        fill={COLOR.inkMuted}
      >
        {detail}
      </text>
      {caption && (
        <text x={w / 2} y={h + 20} textAnchor="middle" className="font-sans text-[11px]" fill={COLOR.inkFaint}>
          {caption}
        </text>
      )}
    </g>
  );
}

/** The architectural point of the whole diagram: sensored readings ARE
 *  ground truth, so a connector runs from Sensored to this node. No
 *  connector exists from Blind — not because it's unlabelled, but because
 *  none is drawn; the inference branch has no route to this node at all. */
function GroundTruthNode({ pos }: { pos: Pt }) {
  const w = 168;
  const h = 52;
  return (
    <g transform={`translate(${pos.x - w / 2}, ${pos.y - h / 2})`}>
      <rect width={w} height={h} rx={26} fill="none" stroke={COLOR.measured} strokeWidth={1.25} strokeDasharray="2 3" opacity={0.7} />
      <text x={w / 2} y={22} textAnchor="middle" className="font-mono text-[10.5px] font-bold uppercase tracking-[0.1em]" fill={COLOR.measured}>
        Ground Truth
      </text>
      <text x={w / 2} y={38} textAnchor="middle" className="font-sans text-[10px]" fill={COLOR.inkMuted}>
        sensored readings only
      </text>
    </g>
  );
}

function TerminalNode({ pos, label, active }: { pos: Pt; label: string; active: boolean }) {
  const w = 480;
  const h = 92;
  return (
    <g transform={`translate(${pos.x - w / 2}, ${pos.y - h / 2})`}>
      <rect
        width={w}
        height={h}
        rx={16}
        fill={COLOR.panelRaised}
        stroke={active ? COLOR.slowing : COLOR.cyan}
        strokeWidth={2}
        style={{ filter: `drop-shadow(0 0 12px ${active ? 'rgba(251,191,36,0.25)' : 'rgba(34,211,238,0.18)'})` }}
      />
      <text x={24} y={30} className="font-mono text-[11px] font-bold uppercase tracking-[0.14em]" fill={active ? COLOR.slowing : COLOR.cyan}>
        Recommended Action
      </text>
      <text x={w - 24} y={30} textAnchor="end" className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]" fill={COLOR.inkMuted}>
        Human decides
      </text>
      <text x={24} y={62} className="font-sans text-[16px] font-semibold" fill={COLOR.inkPrimary}>
        {label}
      </text>
      <text x={24} y={82} className="font-sans text-[11.5px]" fill={COLOR.inkMuted}>
        Stratify recommends, never controls - there is no write path from here to the line.
      </text>
    </g>
  );
}

// ---- connector with traveling pulses -------------------------------------

function FlowConnector({
  waypoints,
  weight,
  active,
}: {
  waypoints: Pt[];
  weight: 'main' | 'branch';
  active: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const pulseRefs = useRef<(SVGCircleElement | null)[]>([]);
  const { lengths, total } = useMemo(() => segmentLengths(waypoints), [waypoints]);
  const pulseCount = weight === 'main' ? 3 : 2;
  // Deliberately NOT tied to the live playback speed (TAKT_SECONDS /
  // playbackMultiple, which runs at 50x and produced a sub-second, hard-to-
  // track sprint). A viewer following one bead through the pipeline is the
  // whole point of this diagram, so the foreground reads at a medium,
  // legible pace — a few seconds per connector — regardless of how fast
  // the underlying simulation itself is ticking. The background flow lines
  // (ViewBackground's pipeline variant) are the ambient layer and move
  // faster than this; the foreground must always be the slower one.
  const period = 4;

  useAnimationFrame((time) => {
    if (reduceMotion) return;
    const tSec = time / 1000;
    for (let i = 0; i < pulseCount; i++) {
      const phase = i / pulseCount;
      const t = ((tSec / period) * (active ? 2 : 1) + phase) % 1;
      const p = pointAtT(waypoints, lengths, total, t);
      pulseRefs.current[i]?.setAttribute('cx', p.x.toFixed(1));
      pulseRefs.current[i]?.setAttribute('cy', p.y.toFixed(1));
    }
  });

  const color = active ? COLOR.slowing : weight === 'main' ? COLOR.lineStrong : COLOR.line;

  return (
    <g>
      <path
        d={pathD(waypoints)}
        fill="none"
        stroke={color}
        strokeWidth={weight === 'main' ? 2 : 1.25}
        opacity={active ? 0.85 : 0.55}
      />
      {!reduceMotion &&
        Array.from({ length: pulseCount }).map((_, i) => (
          <circle
            key={i}
            ref={(el) => {
              pulseRefs.current[i] = el;
            }}
            r={active ? 3.5 : 2.5}
            fill={active ? COLOR.slowing : COLOR.cyan}
            opacity={active ? 0.95 : 0.55}
            style={active ? { filter: `drop-shadow(0 0 4px ${COLOR.slowing})` } : undefined}
          />
        ))}
    </g>
  );
}
