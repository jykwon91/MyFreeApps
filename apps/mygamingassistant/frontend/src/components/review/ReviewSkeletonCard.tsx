/**
 * ReviewSkeletonCard — loading placeholder that mirrors the layout of ReviewCard.
 * Rendered while the pending lineups query is in-flight.
 */
export default function ReviewSkeletonCard() {
  return (
    <div className="rounded-lg border-2 border-border bg-card overflow-hidden animate-pulse">
      <div className="h-14 bg-muted/40 border-b" />
      <div className="grid grid-cols-2 gap-3 p-3">
        <div className="aspect-video bg-muted/40 rounded-md" />
        <div className="aspect-video bg-muted/40 rounded-md" />
      </div>
      <div className="px-3 pb-3 h-16 bg-muted/20 rounded-md mx-3" />
      <div className="px-3 pb-3 flex gap-2">
        <div className="h-8 w-24 bg-muted/40 rounded-md" />
        <div className="h-8 w-28 bg-muted/40 rounded-md" />
      </div>
    </div>
  );
}
