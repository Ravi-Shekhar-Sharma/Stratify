export function PanelTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line-soft px-4 py-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-primary">{title}</h3>
      <span className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-secondary">{subtitle}</span>
    </div>
  );
}
