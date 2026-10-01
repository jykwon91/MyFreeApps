/** Placeholder while the route data loads — same rough shape as the skill box and route. */
export default function CraftRouteSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the leveling route">
      <div className="h-8 w-48 rounded-md bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-16 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-96 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
    </div>
  );
}
