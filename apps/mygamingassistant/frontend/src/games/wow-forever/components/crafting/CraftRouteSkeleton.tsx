interface CraftRouteSkeletonProps {
  /** The guide has a prices panel — keep room for it. */
  priced: boolean;
}

/** Placeholder while the route data loads — same rough shape as the skill box, prices panel (if any) and route. */
export default function CraftRouteSkeleton({ priced }: CraftRouteSkeletonProps) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the leveling route" data-testid="craft-route-skeleton">
      <div className="h-8 w-48 rounded-md bg-muted/40 animate-pulse" aria-hidden />
      <div className="h-16 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
      {priced ? <div className="h-14 rounded-xl bg-muted/40 animate-pulse" aria-hidden data-testid="craft-prices-skeleton" /> : null}
      <div className="h-96 rounded-xl bg-muted/40 animate-pulse" aria-hidden />
    </div>
  );
}
