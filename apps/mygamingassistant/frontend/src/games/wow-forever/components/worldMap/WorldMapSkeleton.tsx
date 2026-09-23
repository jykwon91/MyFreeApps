/** Placeholder with the loaded page's shape while the map data downloads. */
export default function WorldMapSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the world map">
      <div className="h-36 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted/40 animate-pulse" aria-hidden />
          ))}
        </div>
        <div className="aspect-[3/2] rounded-xl bg-muted/40 animate-pulse" aria-hidden />
      </div>
    </div>
  );
}
