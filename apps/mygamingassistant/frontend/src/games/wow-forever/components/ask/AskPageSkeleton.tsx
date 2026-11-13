/** The Ask page while its map data loads: location chip, the example card, and the question box. */
export default function AskPageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" data-testid="ask-skeleton">
      <div className="flex gap-2" aria-hidden data-section="location">
        <div className="h-11 w-48 rounded-full bg-muted animate-pulse" />
        <div className="h-11 w-36 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="h-40 rounded-xl bg-muted animate-pulse" aria-hidden data-section="body" />
      <div className="space-y-2" aria-hidden data-section="composer">
        <div className="h-16 rounded-md bg-muted animate-pulse" />
        <div className="ml-auto h-11 w-24 rounded-md bg-muted animate-pulse" />
      </div>
    </div>
  );
}
