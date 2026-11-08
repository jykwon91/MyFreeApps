const BAR = "rounded bg-muted/40 animate-pulse";

/** Mirrors the loaded quest detail layout: header, facts, rewards. */
export default function QuestDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading quest" data-testid="quest-detail-skeleton">
      <header className="flex items-start gap-3" aria-hidden>
        <div className={`h-11 w-11 shrink-0 rounded-md ${BAR}`} />
        <div className="flex-1 space-y-2">
          <div className={`h-7 w-2/3 ${BAR}`} />
          <div className={`h-5 w-1/3 ${BAR}`} />
        </div>
      </header>
      <div className="space-y-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-card p-4">
            <div className={`h-5 w-28 ${BAR}`} />
            <div className={`h-4 w-1/2 ${BAR}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
