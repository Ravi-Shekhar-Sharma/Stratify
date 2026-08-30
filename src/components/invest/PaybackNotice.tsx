interface Props {
  status: { available: boolean; reason: string };
}

/**
 * States plainly that payback is not computed, and why, rather than
 * omitting the section or filling it with an invented dollar figure —
 * the same abstention discipline the Twin view applies to blind stations,
 * applied here to a missing input number instead of a missing sensor.
 */
export function PaybackNotice({ status }: Props) {
  return (
    <div className="flex items-start gap-3 border border-line-strong bg-panel-raised px-4 py-3">
      <span className="mt-0.5 h-2 w-2 shrink-0 bg-slowing" />
      <div>
        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-primary">
          Payback: not available
        </div>
        <p className="mt-1 text-[10.5px] leading-snug text-ink-secondary">{status.reason}</p>
      </div>
    </div>
  );
}
