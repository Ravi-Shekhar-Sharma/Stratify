export function Skeleton() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-12 w-12 border border-line bg-panel" style={{ borderRadius: 3 }}>
          <span className="absolute inset-0 overflow-hidden" style={{ borderRadius: 3 }}>
            <span className="absolute top-0 h-full w-1/3 bg-cyan/10 animate-sweep" />
          </span>
        </div>
        <div className="text-[12px] font-bold uppercase tracking-[0.22em] text-ink-secondary">
          Stratify
        </div>
        <div className="font-mono text-[11px] tabular-nums text-ink-secondary">
          CONNECTING · Line A
        </div>
      </div>

      <div className="w-full max-w-[1100px] space-y-3 px-6">
        <div className="h-12 border border-line-soft bg-panel" style={{ borderRadius: 3 }} />
        <div className="flex gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-[150px] flex-1 border border-line-soft bg-panel"
              style={{ borderRadius: 3 }}
            >
              <div className="m-2.5 h-3 w-10 bg-line" />
              <div className="mx-2.5 mt-1 h-3 w-16 bg-line" />
              <div className="mx-2.5 mt-3 h-5 w-12 bg-line" />
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[230px] border border-line-soft bg-panel"
              style={{ borderRadius: 3 }}
            />
          ))}
        </div>
        <div className="h-[120px] border border-line-soft bg-panel" style={{ borderRadius: 3 }} />
      </div>
    </div>
  );
}
