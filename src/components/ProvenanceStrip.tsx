interface Props {
  children: React.ReactNode;
  /** Skip the top hairline + padding for a context that already supplies
   *  its own separation (ViewHero's `secondary` row already sits below a
   *  border-t of its own) — without this, two hairlines would stack. */
  bare?: boolean;
}

/**
 * A small, clearly-separated citation line for a panel's source data —
 * file paths, seed ranges, artifact names. These are genuinely valuable on
 * the evidence views (Trust/Plant/Invest) and never deleted, but a sentence
 * a human reads should never contain one: this exists so provenance has its
 * own designed spot, distinct from body copy, instead of leaking into
 * prose. A small square tick + uppercase "SOURCE" tag reads as deliberate
 * metadata rather than an unstyled leftover line of text - the same
 * register as a SectionLabel's own tick mark, at a fraction of the weight.
 */
export function ProvenanceStrip({ children, bare = false }: Props) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-caption normal-case tracking-[0.02em] text-ink-muted ${
        bare ? '' : 'mt-3 border-t border-line-soft pt-2.5'
      }`}
    >
      <span className="inline-flex shrink-0 items-baseline gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-[1px] bg-ink-faint" aria-hidden />
        <span className="font-semibold uppercase tracking-[0.16em] text-ink-secondary/85">Source</span>
      </span>
      <span className="text-ink-muted">{children}</span>
    </div>
  );
}
