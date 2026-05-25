/** Single-tile skeleton for the /lineups/:id direct-link page. */
export default function LineupDetailSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <div className="h-5 w-32 bg-muted/40 rounded animate-pulse" />
      <div className="rounded-lg bg-muted/40 animate-pulse" style={{ aspectRatio: "2 / 1" }} />
    </div>
  );
}
