/** Placeholder while the spawn data loads — the same shape as the "now" card and the zone list. */
export default function GatheringNowSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading where to gather" data-testid="gathering-skeleton">
      <div className="h-16 rounded-xl bg-muted animate-pulse" aria-hidden />
      <div className="h-4 w-32 rounded bg-muted animate-pulse" aria-hidden />
      <div className="h-48 rounded-xl bg-muted animate-pulse" aria-hidden />
    </div>
  );
}
