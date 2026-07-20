/**
 * MapPageSkeleton — loading placeholder for MapPage while the map detail
 * query is in flight. Mirrors the top bar + a large board block so the
 * layout doesn't shift when data arrives.
 */
export default function MapPageSkeleton() {
  return (
    <main className="p-4 sm:p-8 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-muted/40 animate-pulse" />
        <div className="h-7 w-40 bg-muted/40 rounded animate-pulse" />
      </div>
      <div className="h-10 bg-muted/40 rounded-lg animate-pulse" />
      <div className="h-96 bg-muted/40 rounded-xl animate-pulse" />
    </main>
  );
}
