import { Skeleton } from "@platform/ui";

/** Stands in for the rows when the filters depend on prices that haven't loaded yet. */
export default function WritsRowsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading writs" className="space-y-3" data-testid="writs-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
