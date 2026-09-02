import type { View } from './TopNav';

interface Props {
  targetView: View;
  targetLabel: string;
  /** What the next view answers, in the same terse register as a
   *  SectionLabel — never a call to action ("See Trust!"), just what's
   *  there, the way a table of contents names a chapter. */
  description: string;
  onNavigate: (view: View) => void;
}

/**
 * The one thread connecting all five tabs into a single argument instead
 * of five unrelated dashboards: a quiet, typographic "next chapter" link
 * at the foot of every view, in the fixed order the product actually
 * argues in (Floor -> Pipeline -> Trust -> Plant -> Invest). Deliberately
 * restrained — no icon, no arrow glyph, no button chrome beyond a hover
 * colour shift - so it reads as document navigation, not a marketing CTA.
 * Invest is the last chapter and renders no ChapterNav at all, the same
 * way a book's final chapter doesn't point past its own ending.
 */
export function ChapterNav({ targetView, targetLabel, description, onNavigate }: Props) {
  return (
    <div className="border-t border-line-soft px-6 py-6 sm:px-8">
      <button type="button" onClick={() => onNavigate(targetView)} className="group flex flex-col gap-1 text-left">
        <span className="font-mono text-caption font-bold uppercase tracking-[0.18em] text-ink-muted transition-colors duration-150 group-hover:text-cyan">
          Next - {targetLabel}
        </span>
        <span className="text-[15px] leading-[1.5] text-white/72 transition-colors duration-150 group-hover:text-white/90">
          {description}
        </span>
      </button>
    </div>
  );
}
