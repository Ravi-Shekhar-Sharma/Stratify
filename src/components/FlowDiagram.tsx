import { useState } from 'react';

type NodeId =
  | 'sources' | 'ingestion'
  | 'sensored' | 'blind'
  | 'twin'
  | 'forward' | 'defect'
  | 'action';

interface FlowNode {
  id: NodeId;
  title: string;
  desc: string;
  kind: 'main' | 'branch' | 'merge' | 'leaf';
}

const NODES: FlowNode[] = [
  { id: 'sources', title: 'Data sources', desc: 'Wired sensors, manual stations, MES logs', kind: 'main' },
  { id: 'ingestion', title: 'Ingestion', desc: 'Buffer and MES sync', kind: 'main' },
  { id: 'sensored', title: 'Sensored stations', desc: 'Direct measurement', kind: 'branch' },
  { id: 'blind', title: 'Blind stations', desc: 'Soft-sensor inference (confidence-tagged)', kind: 'branch' },
  { id: 'twin', title: 'Live twin state', desc: 'Every station, with a confidence score', kind: 'merge' },
  { id: 'forward', title: 'Forward simulation', desc: 'Bottleneck and ripple risk', kind: 'branch' },
  { id: 'defect', title: 'Defect correlation', desc: 'Flags the source station', kind: 'branch' },
  { id: 'action', title: 'Recommended action', desc: 'Plain instruction, human decides', kind: 'merge' },
];

const LAYOUT: { id: NodeId; col: 'center' | 'left' | 'right' }[] = [
  { id: 'sources', col: 'center' },
  { id: 'ingestion', col: 'center' },
  { id: 'sensored', col: 'left' },
  { id: 'blind', col: 'right' },
  { id: 'twin', col: 'center' },
  { id: 'forward', col: 'left' },
  { id: 'defect', col: 'right' },
  { id: 'action', col: 'center' },
];

const NEON = '#56B6E0';

export function FlowDiagram() {
  const [hovered, setHovered] = useState<NodeId | null>(null);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: '#0A0D11' }}
      aria-label="Stratify pipeline flow"
    >
      <div className="mx-auto max-w-[760px] px-6 pt-10 pb-2">
        <div className="flex items-center gap-2.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: NEON, boxShadow: `0 0 8px ${NEON}` }}
          />
          <h1 className="text-[13px] font-bold uppercase tracking-[0.24em]" style={{ color: NEON }}>
            Stratify · Pipeline Flow
          </h1>
        </div>
        <p className="mt-2 max-w-[520px] text-[12px] leading-relaxed text-ink-secondary">
          How signals become a recommendation — from raw telemetry to a plain
          instruction a person acts on.
        </p>
      </div>

      <div className="mx-auto max-w-[760px] px-6 pb-16 pt-4">
        <div className="relative">
          <Connectors hovered={hovered} />

          <div className="relative grid grid-cols-2 gap-x-10 gap-y-7">
            {LAYOUT.map(({ id, col }) => {
              const node = NODES.find((n) => n.id === id)!;
              const isHover = hovered === id;
              return (
                <div
                  key={id}
                  className={[
                    'col-span-2',
                    col === 'left' ? '!col-start-1 !col-end-2' : '',
                    col === 'right' ? '!col-start-2 !col-end-3' : '',
                    col === 'center' ? '!col-start-1 !col-end-3' : '',
                  ].join(' ')}
                  onMouseEnter={() => setHovered(id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <NodeCard node={node} hover={isHover} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function NodeCard({ node, hover }: { node: FlowNode; hover: boolean }) {
  const isLeaf = node.kind === 'merge' && node.id === 'action';
  const glow = hover
    ? `0 0 0 1px ${NEON}, 0 0 14px rgba(86,182,224,0.35)`
    : `0 0 0 1px rgba(86,182,224,0.35), 0 0 8px rgba(86,182,224,0.12)`;
  const borderColor = hover ? NEON : 'rgba(86,182,224,0.35)';

  return (
    <div
      className={[
        'group relative px-5 py-4 transition-all duration-200 ease-out',
        hover ? '-translate-y-0.5' : 'translate-y-0',
      ].join(' ')}
      style={{
        background: '#10151B',
        border: `1px solid ${borderColor}`,
        boxShadow: glow,
        borderRadius: 6,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: NEON, opacity: hover ? 1 : 0.7 }}
        >
          {node.kind}
        </span>
        {isLeaf && (
          <span
            className="ml-auto px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: NEON, border: `1px solid ${NEON}`, background: 'rgba(86,182,224,0.08)', borderRadius: 2 }}
          >
            Human decides
          </span>
        )}
      </div>

      <h3
        className="mt-1.5 text-[14px] font-bold leading-tight text-ink-primary"
        style={{ textShadow: hover ? `0 0 12px rgba(86,182,224,0.25)` : 'none' }}
      >
        {node.title}
      </h3>
      <p className="mt-1 text-[12px] leading-snug text-ink-secondary">{node.desc}</p>
    </div>
  );
}

function Connectors({ hovered }: { hovered: NodeId | null }) {
  const W = 760;
  const H = 920;
  const cx = W / 2;
  const leftX = 175;
  const rightX = 585;

  const line = (d: string, active: boolean) => (
    <path
      d={d}
      fill="none"
      stroke={active ? NEON : 'rgba(86,182,224,0.28)'}
      strokeWidth={active ? 1.5 : 1}
      style={{ filter: active ? `drop-shadow(0 0 4px ${NEON})` : 'none', transition: 'all 200ms ease-out' }}
    />
  );

  const isActive = (a: NodeId, b: NodeId) => hovered === a || hovered === b;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <marker id="arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={NEON} opacity="0.7" />
        </marker>
        <marker id="arrow-active" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={NEON} />
        </marker>
      </defs>

      {line(`M${cx} 92 L${cx} 168`, isActive('sources', 'ingestion'))}
      {line(`M${cx} 212 L${cx} 250 L${leftX} 250 L${leftX} 298`, isActive('ingestion', 'sensored'))}
      {line(`M${cx} 212 L${cx} 250 L${rightX} 250 L${rightX} 298`, isActive('ingestion', 'blind'))}
      {line(`M${leftX} 360 L${leftX} 420 L${cx} 420 L${cx} 448`, isActive('sensored', 'twin'))}
      {line(`M${rightX} 360 L${rightX} 420 L${cx} 420 L${cx} 448`, isActive('blind', 'twin'))}
      {line(`M${cx} 492 L${cx} 530 L${leftX} 530 L${leftX} 578`, isActive('twin', 'forward'))}
      {line(`M${cx} 492 L${cx} 530 L${rightX} 530 L${rightX} 578`, isActive('twin', 'defect'))}
      {line(`M${leftX} 640 L${leftX} 700 L${cx} 700 L${cx} 728`, isActive('forward', 'action'))}
      {line(`M${rightX} 640 L${rightX} 700 L${cx} 700 L${cx} 728`, isActive('defect', 'action'))}
    </svg>
  );
}
