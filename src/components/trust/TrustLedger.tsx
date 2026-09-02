import type { LedgerRow } from '@/trustMetrics';

interface Props {
  rows: LedgerRow[];
  totalIncidentRuns: number;
}

function tick(t: number): string {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function lead(s: number): string {
  const sign = s < 0 ? '-' : '+';
  return `${sign}${Math.abs(s).toFixed(1)}s`;
}

const OUTCOME_CLASS: Record<string, string> = {
  'WARNED IN TIME': 'text-measured',
  'WARNED LATE': 'text-starved',
};

/**
 * Append-only, scored record of real predictions — a flight recorder, not
 * a spreadsheet dump: dense, monospace, tabular-numeral timestamps by
 * simulation tick, one real named shift per row (src/trustMetrics.ts's
 * buildLedgerRows). BASIS is never omitted and gets its own colour lane
 * so the deliverable/physical-headroom distinction — the actual point of
 * this table — is readable at a glance, not just from the text label.
 * The header states the full scored-set size alongside the curated
 * sample shown, per Round 2 item 11: this is a worked sample, never
 * implied to be the entire evidence base.
 */
export function TrustLedger({ rows, totalIncidentRuns }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft px-5 py-4">
        <span className="font-mono text-caption font-bold uppercase tracking-[0.16em] text-ink-secondary">
          Trust Ledger
        </span>
        <span className="font-mono text-[13px] tabular-nums text-ink-muted">
          {rows.length}-row worked sample of {totalIncidentRuns.toLocaleString()} scored incident runs
        </span>
      </div>
      <div className="thin-scroll flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[12.5px]">
          <thead className="sticky top-0 bg-panel-raised">
            <tr className="text-left text-ink-secondary">
              <Th first>ONSET</Th>
              <Th>SHIFT</Th>
              <Th>BAND</Th>
              <Th>BASIS</Th>
              <Th>ALERT@</Th>
              <Th>STARVE@</Th>
              <Th align="right">LEAD</Th>
              <Th>OUTCOME</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line-soft">
                <Td first className="relative text-ink-muted">
                  <span
                    aria-hidden
                    className={`absolute left-0 top-0 h-full w-[3px] ${row.basis === 'deliverable' ? 'bg-inferred' : 'bg-line-strong'}`}
                  />
                  <span className="pl-2">{tick(row.onsetTick)}</span>
                </Td>
                <Td className="text-ink-secondary">{row.shiftSeed}</Td>
                <Td className="uppercase text-ink-secondary">{row.band}</Td>
                <Td className={row.basis === 'deliverable' ? 'font-semibold text-inferred' : 'text-ink-muted'}>
                  {row.basis === 'deliverable' ? 'DELIVERABLE' : 'PHYS. HEADROOM'}
                </Td>
                <Td className="text-ink-primary">{tick(row.alertTick)}</Td>
                <Td className="text-ink-primary">{tick(row.starvedTick)}</Td>
                <Td align="right" className="font-semibold text-ink-primary">
                  {lead(row.leadTimeSeconds)}
                </Td>
                <Td className={`${OUTCOME_CLASS[row.outcome] ?? 'text-ink-muted'} whitespace-nowrap`}>{row.outcome}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-4">
        <p className="text-[15px] leading-[1.55] text-white/62">
          4 worked examples (1 deliverable + 1 physical-headroom per severity band) plus the 10 most-negative
          worst-case runs under the physical-headroom pairing - the worst cases are kept in, not filtered out. The
          left edge colour marks deliverable rows (the alert the live product actually commits on) against physical-
          headroom reference rows.
        </p>
      </div>
    </div>
  );
}

function Th({ children, align = 'left', first = false }: { children: React.ReactNode; align?: 'left' | 'right'; first?: boolean }) {
  return (
    <th
      className={`border-b border-line py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] ${align === 'right' ? 'pr-4 text-right' : 'px-3 text-left'} ${first ? 'pl-5' : ''}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  align = 'left',
  first = false,
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
  first?: boolean;
}) {
  return (
    <td className={`py-2.5 tabular-nums ${align === 'right' ? 'pr-4 text-right' : 'px-3'} ${first ? 'pl-5' : ''} ${className}`}>
      {children}
    </td>
  );
}
