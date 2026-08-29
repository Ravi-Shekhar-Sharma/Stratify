export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-soft px-6 py-3">
      <LegendItem label="Measured" swatch={<span className="h-2 w-2 bg-measured" />} />
      <LegendItem
        label="Inferred (confidence shown)"
        swatch={<span className="h-2.5 w-4 border border-dashed border-inferred/60" />}
      />
      <LegendItem label="Degrading" swatch={<span className="font-mono text-[11px] leading-none text-slowing">▲</span>} />
      <LegendItem
        label="Abstained"
        swatch={
          <span
            className="h-2.5 w-4 border border-line-soft"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, #3D4651 0px, #3D4651 1px, transparent 1px, transparent 5px)',
            }}
          />
        }
      />
    </div>
  );
}

function LegendItem({ label, swatch }: { label: string; swatch: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {swatch}
      <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-secondary">{label}</span>
    </div>
  );
}
