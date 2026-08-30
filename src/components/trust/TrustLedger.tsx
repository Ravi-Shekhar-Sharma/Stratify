import { PanelTitle } from '../PanelTitle';
import type { LedgerRow } from '@/trustMetrics';

interface Props {
  rows: LedgerRow[];
}

function tick(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function lead(s: number): string {
  const sign = s < 0 ? '-' : '+';
  return `${sign}${Math.abs(s).toFixed(0)}s`;
}

const OUTCOME_CLASS: Record<string, string> = {
  'WARNED IN TIME': 'text-measured',
  'WARNED LATE': 'text-starved',
};

/**
 * Append-only, scored record of real predictions — a flight recorder, not
 * a dashboard widget: dense, monospace, timestamped by simulation tick,
 * one real named shift per row (src/trustMetrics.ts's buildLedgerRows).
 * BASIS is never omitted — a physicalHeadroom row reads as exactly that,
 * never dressed up as a delivered outcome.
 */
export function TrustLedger({ rows }: Props) {
  return (
    <div className="flex h-full flex-col">
      <PanelTitle title="Trust Ledger" subtitle={`${rows.length} scored records`} />
      <div className="thin-scroll flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[10.5px]">
          <thead className="sticky top-0 bg-panel-raised">
            <tr className="text-left text-ink-secondary">
              <Th>ONSET</Th>
              <Th>SHIFT</Th>
              <Th>BAND</Th>
              <Th>BASIS</Th>
              <Th>ALERT@</Th>
              <Th>STARVE@</Th>
              <Th>LEAD</Th>
              <Th>OUTCOME</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line-soft">
                <Td className="text-ink-muted">{tick(row.onsetTick)}</Td>
                <Td className="text-ink-secondary">{row.shiftSeed}</Td>
                <Td className="text-ink-secondary">{row.band}</Td>
                <Td className={row.basis === 'deliverable' ? 'text-inferred' : 'text-ink-muted'}>
                  {row.basis === 'deliverable' ? 'DELIVERABLE' : 'PHYS. HEADROOM'}
                </Td>
                <Td className="text-ink-primary">{tick(row.alertTick)}</Td>
                <Td className="text-ink-primary">{tick(row.starvedTick)}</Td>
                <Td className="font-semibold text-ink-primary">{lead(row.leadTimeSeconds)}</Td>
                <Td className={OUTCOME_CLASS[row.outcome] ?? 'text-ink-muted'}>{row.outcome}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[9.5px] leading-snug text-ink-muted">
        4 worked examples (1 deliverable + 1 physical-headroom per severity band) plus the 10 most-negative
        worst-case runs under the physical-headroom pairing — the worst cases are kept in, not filtered out.
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-line px-3 py-2 text-[9px] font-bold uppercase tracking-[0.1em]">{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 tabular-nums ${className}`}>{children}</td>;
}
