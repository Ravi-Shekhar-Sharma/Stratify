export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
      <LegendItem label="Measured" swatch={<span className="h-2.5 w-2.5 rounded-full bg-measured" />} />
      <LegendItem
        label="Inferred (confidence shown)"
        swatch={<span className="h-2.5 w-4 rounded border border-dashed border-inferred/70" />}
      />
      <LegendItem label="Degrading" swatch={<span className="text-[13px] leading-none text-slowing">▲</span>} />
      <LegendItem
        label="Abstained"
        swatch={
          <span
            className="h-2.5 w-4 rounded border border-line-strong"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, #4B5563 0px, #4B5563 1px, transparent 1px, transparent 5px)',
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
      <span className="text-caption uppercase text-ink-muted">{label}</span>
    </div>
  );
}
