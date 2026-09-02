import { motion } from 'motion/react';
import { PanelTitle } from '../PanelTitle';
import { DRAW_IN } from '@/motion';
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
 *
 * The OEE column carries an inline bar (design round 3, item 7) scaled to
 * the actual observed min-max across these ten stations, not a flat
 * 0-100% axis — these values cluster tightly (roughly 80-85%), so a
 * fixed-scale bar would flatten every row to the same near-full width and
 * add nothing a reader couldn't already read from the number.
 */
export function AvailabilityOeeTable({ rows }: Props) {
  const oees = rows.map((r) => r.meanOee);
  const domainMin = Math.max(0, Math.min(...oees) - 0.03);
  const domainMax = Math.max(...oees) + 0.02;
  const span = domainMax - domainMin || 1;

  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Station Availability & OEE" />
      <div className="thin-scroll flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[10.5px]">
          <thead className="sticky top-0 bg-panel-raised">
            <tr className="text-left text-ink-secondary">
              <Th>Station</Th>
              <Th>Tier</Th>
              <Th align="right">Availability</Th>
              <Th align="right">Performance</Th>
              <Th align="right">OEE</Th>
              <Th>Relative to this set</Th>
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
                <td className="px-3 py-1.5">
                  <div className="h-1.5 w-24 rounded-full bg-panel-inset">
                    <motion.div
                      className="h-full rounded-full bg-measured"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(4, ((r.meanOee - domainMin) / span) * 100)}%` }}
                      transition={{ duration: DRAW_IN.duration, ease: DRAW_IN.ease }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[15px] leading-[1.55] text-white/62">
        Quality is not modeled in this simulation - no defect or scrap signal exists anywhere in this engine. OEE
        above is Availability multiplied by Performance only, not a full three-factor calculation. The bar is scaled
        to the {pct(domainMin)}-{pct(domainMax)} range observed across these ten stations, not a fixed 0-100% axis.
      </p>
    </div>
  );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  const alignClass = align === 'right' ? 'text-right' : 'text-left';
  return (
    <th className={`border-b border-line px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] ${alignClass}`}>
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
