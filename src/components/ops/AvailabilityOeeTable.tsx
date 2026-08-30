import { PanelTitle } from '../PanelTitle';
import type { StationAvailabilityOee } from '@/opsMetrics';

interface Props {
  rows: StationAvailabilityOee[];
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

/**
 * ISO 22400-2 Availability and Performance, averaged across the held-out
 * simulated shifts. Availability = Operating Time / Planned Production
 * Time; Performance = (Ideal Cycle Time x Count) / Operating Time — both
 * computed only from entry/exit timing and nominal cycle time this engine
 * already produces. Quality, ISO 22400-2's third OEE factor, is not
 * computed: there is no defect/scrap signal anywhere in this engine. The
 * "OEE" column is stated as Availability x Performance only, with that
 * caveat printed directly beneath it rather than assumed away.
 */
export function AvailabilityOeeTable({ rows }: Props) {
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Station Availability & OEE" subtitle="ISO 22400-2, A x P" />
      <div className="thin-scroll flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[10.5px]">
          <thead className="sticky top-0 bg-panel-raised">
            <tr className="text-left text-ink-secondary">
              <Th>Station</Th>
              <Th>Tier</Th>
              <Th align="right">Availability</Th>
              <Th align="right">Performance</Th>
              <Th align="right">OEE (A x P)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.stationId} className="border-t border-line-soft">
                <Td className="font-semibold text-ink-primary">{r.stationId}</Td>
                <Td className="text-ink-secondary">{r.tier}</Td>
                <Td align="right">{pct(r.meanAvailability)}</Td>
                <Td align="right">{pct(r.meanPerformance)}</Td>
                <Td align="right" className="font-semibold text-ink-primary">
                  {pct(r.meanOee)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[9px] leading-snug text-ink-muted">
        Quality is not modeled in this simulation — no defect or scrap signal exists anywhere in this engine. OEE
        above is Availability x Performance only, not the full ISO 22400-2 three-factor product.
      </p>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left';
  return (
    <th className={`border-b border-line px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em] ${alignClass}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  align = 'left',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left';
  return <td className={`px-3 py-1.5 tabular-nums ${alignClass} ${className}`}>{children}</td>;
}
