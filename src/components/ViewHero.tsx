import { AnimatedNumber } from './AnimatedNumber';

export interface ProofStatSpec {
  value: number;
  suffix?: string;
  label: string;
  tone: string;
  decimals?: number;
}

interface Props {
  eyebrow: string;
  headline: string;
  subtitle: string;
  proofs: [ProofStatSpec, ProofStatSpec, ProofStatSpec];
  /** Optional secondary row below the proof numbers — each tab's own
   *  operational context, not a fixed shape, so the four heroes don't read
   *  as one template repeated (Floor uses Takt/Rate; a tab can use
   *  anything real here, or nothing). */
  secondary?: React.ReactNode;
}

/**
 * The shared hero rhythm every non-Floor tab now opens with — display
 * headline carrying a thesis, a short subtitle, three real proof numbers,
 * optional secondary context, then a divider into the tab's own content.
 * Deliberately a NEW, generic component, not a re-export of Floor's
 * TwinHeader: Floor is locked and untouched, and each tab's headline,
 * subtitle, proof numbers, and secondary row are entirely its own — this
 * file only carries the shared structure and typography, never the words.
 */
export function ViewHero({ eyebrow, headline, subtitle, proofs, secondary }: Props) {
  return (
    <header className="border-b border-line-soft px-6 pb-8 pt-10 sm:px-8">
      <span className="font-mono text-caption font-bold uppercase tracking-[0.16em] text-ink-muted">{eyebrow}</span>
      {/* lg:text-display, not text-h1: this hero's headline must match
          Floor's TwinHeader and BootScene exactly (all three are page-level
          hero headlines, the same role) - text-h1 (36px) here against
          text-display (56px) on Floor was a real, visible 20px gap between
          Floor and every other tab, not an intentional distinction. */}
      <h1 className="mt-3 max-w-3xl text-[32px] font-bold font-mono leading-[1.1] tracking-[-0.01em] text-ink-primary sm:text-[42px] sm:leading-[1.08] sm:tracking-[-0.015em] lg:text-display lg:tracking-[-0.02em]">
        {headline}
      </h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-[1.6] text-white/72">{subtitle}</p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {proofs.map((p, i) => (
          <ProofStat key={i} {...p} />
        ))}
      </div>

      {secondary && <div className="mt-8 flex flex-wrap items-end gap-8 border-t border-line-soft pt-6">{secondary}</div>}
    </header>
  );
}

function ProofStat({ value, suffix, label, tone, decimals = 0 }: ProofStatSpec) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`font-mono text-[36px] font-bold leading-none tabular-nums ${tone}`}>
        <AnimatedNumber value={value} format={(v) => v.toFixed(decimals)} />
        {suffix && <span className="ml-1.5 text-[15px] font-semibold text-white/50">{suffix}</span>}
      </span>
      <span className="text-[13px] leading-[1.4] text-white/72">{label}</span>
    </div>
  );
}

/** Reusable secondary-row metric (the Takt/Rate-style slot) for a hero's
 *  optional operational context row. */
export function HeroMetric({ label, value, valueNode }: { label: string; value?: string; valueNode?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption uppercase tracking-[0.08em] text-white/50">{label}</span>
      <span className="font-mono text-[20px] font-semibold tabular-nums text-ink-primary">{valueNode ?? value}</span>
    </div>
  );
}
