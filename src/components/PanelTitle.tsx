export function PanelTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-line-soft px-5 py-4">
      <h3 className="font-mono text-caption font-bold uppercase tracking-[0.14em] text-ink-primary">{title}</h3>
      {subtitle && <span className="font-mono text-caption uppercase text-ink-muted">{subtitle}</span>}
    </div>
  );
}
