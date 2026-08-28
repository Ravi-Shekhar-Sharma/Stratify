const ITEMS: { label: string; cls: string }[] = [
  { label: 'Measured', cls: 'bg-measured' },
  { label: 'Inferred', cls: 'bg-inferred' },
  { label: 'Slowing', cls: 'bg-slowing' },
  { label: 'Starved', cls: 'bg-starved' },
];

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line-soft px-6 py-3">
      {ITEMS.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${it.cls}`} />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-secondary">
            {it.label}
          </span>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-2">
        <span className="h-2.5 w-4 border border-dashed border-inferred/60" />
        <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-secondary">
          No sensor
        </span>
      </div>
    </div>
  );
}
