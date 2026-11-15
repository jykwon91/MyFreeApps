import GuildSkeletonCard from "@/games/wow-forever/components/guild/GuildSkeletonCard";

/** The Help each other tab while it loads: a filter bar and three placeholder cards. */
export default function GuildHelpSkeleton() {
  return (
    <GuildSkeletonCard testId="guild-help-skeleton">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[88, 96, 112].map((w) => (
          <div key={w} className={`h-9 w-${w / 4} shrink-0 rounded-full bg-muted animate-pulse`} style={{ width: w }} />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((n) => (
          <div key={n} className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex gap-2 items-center">
              <div className="h-5 w-24 rounded bg-muted animate-pulse" />
              <div className="text-muted-foreground">→</div>
              <div className="h-5 w-24 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
            <div className="flex gap-1.5">
              {[1, 2, 3].map((r) => (
                <div key={r} className="h-5 w-16 rounded bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </GuildSkeletonCard>
  );
}
