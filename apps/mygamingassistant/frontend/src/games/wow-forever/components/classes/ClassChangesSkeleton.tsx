/** Skeleton for the ClassChangesSection while change data loads. */
export default function ClassChangesSkeleton() {
  return (
    <div className="space-y-4" data-testid="class-changes-skeleton" aria-hidden>
      {/* Section heading */}
      <div className="h-4 w-40 rounded bg-muted animate-pulse" />
      {/* Two sub-groups (talents + spells) */}
      {[0, 1].map((group) => (
        <div key={group} className="space-y-2">
          <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 w-56 rounded bg-muted animate-pulse" />
          ))}
          <div className="h-3 w-24 rounded-full bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}
