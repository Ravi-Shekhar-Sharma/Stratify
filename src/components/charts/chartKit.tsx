import { COLOR } from '@/theme';

/**
 * Shared chart visual language (dataviz skill, design round 3 item 16).
 * Every new chart in this product — the bottleneck heatmap, the shift
 * variation range chart, the investment ranked bars, the budget
 * progression, the alerting comparison, the tier-error chart — is built
 * from these constants and small presentational pieces rather than each
 * picking its own stroke widths, greys, and label sizes. One axis/gridline
 * treatment, one label typography, one legend pattern, one tooltip shell,
 * one entry-animation source (`@/motion`'s DRAW_IN / VALUE_CHANGE, reused
 * as-is, not reinvented per chart).
 *
 * Evaluated Bklit UI and Kokonut UI for this pass (per user instruction,
 * cold-install cost stated before any decision): both ship as real npm
 * dependencies with their own component styling assumptions, and neither
 * targets this app's exact token set (IBM Plex Mono numerics, the
 * measured/inferred/degrading/abstained colour semantics, the specific
 * dark surface ramp). Trust's own CalibrationChart already made and
 * documented this call for the identical reason. Hand-rolled SVG on shared
 * primitives costs zero added dependency weight and stays pixel-exact to
 * the existing design system; a real library would need as much
 * token-matching wrapper code as it saves. Nothing added.
 */
export const CHART = {
  gridStroke: 'rgba(255,255,255,0.07)',
  axisStroke: COLOR.lineSoft,
  tickFill: COLOR.inkMuted,
  labelFill: COLOR.inkSecondary,
  titleFill: COLOR.inkPrimary,
  tickFontSize: 11,
  labelFontSize: 12.5,
  titleFontSize: 16,
  subtitleFontSize: 12.5,
  monoFont: 'IBM Plex Mono, monospace',
  sansFont: 'Space Grotesk, sans-serif',
} as const;

/** The Floor legend's functional colours, reused verbatim wherever a tier
 *  or state needs colour anywhere in the product — never reassigned to a
 *  different meaning. Sensored=measured(green), partial/blind=inferred
 *  (cyan): both tiers are inferred, never raw-measured, on Floor; blind is
 *  distinguished from partial by weight (hollow/lighter), not by hue,
 *  since Floor has no separate colour for "less coverage." */
export const TIER_COLOR = {
  sensored: COLOR.measured,
  partial: COLOR.inferred,
  blind: COLOR.inferred,
} as const;

/** Self-explanatory chart title baked directly into the SVG (mono, bold)
 *  plus an optional plain-language subtitle beneath it - every chart needs
 *  to survive being screenshotted onto a slide with zero surrounding page
 *  context (item 17). */
export function ChartTitle({
  x,
  y,
  title,
  subtitle,
}: {
  x: number;
  y: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <>
      <text
        x={x}
        y={y}
        fontFamily={CHART.monoFont}
        fontSize={CHART.titleFontSize}
        fontWeight={700}
        fill={CHART.titleFill}
      >
        {title}
      </text>
      {subtitle && (
        <text x={x} y={y + 19} fontFamily={CHART.sansFont} fontSize={CHART.subtitleFontSize} fill={CHART.tickFill}>
          {subtitle}
        </text>
      )}
    </>
  );
}

/** One legend row pattern for every chart that needs one: small swatch +
 *  mono caption label, wrapped, never a chip/pill/icon. */
export function ChartLegend({ items }: { items: { swatch: React.ReactNode; label: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 font-mono text-[11px] text-ink-secondary">
          {it.swatch}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** One tooltip shell for every chart's hover state - dark raised surface,
 *  strong border, mono numerics - positioning stays per-chart (a bar chart
 *  and a scatter position their tooltip differently) but the shell itself
 *  never varies. */
export function ChartTooltip({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[150px] rounded border border-line-strong bg-panel-raised px-3.5 py-3 shadow-raised"
      style={style}
    >
      {children}
    </div>
  );
}

/** Standard plain-language axis-title text element, rotated for a y-axis
 *  when needed - kept as one helper so every chart's axis label sits at
 *  the same size/weight/colour. */
export function AxisTitle({
  x,
  y,
  children,
  rotate = false,
}: {
  x: number;
  y: number;
  children: string;
  rotate?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      fontFamily={CHART.sansFont}
      fontSize={12}
      fontWeight={600}
      letterSpacing="0.02em"
      fill={CHART.labelFill}
      textAnchor="middle"
      transform={rotate ? `rotate(-90 ${x} ${y})` : undefined}
    >
      {children}
    </text>
  );
}
