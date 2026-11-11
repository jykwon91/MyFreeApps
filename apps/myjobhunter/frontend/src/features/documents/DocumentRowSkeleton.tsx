import { Skeleton } from "@platform/ui";

/** Placeholder shaped like DocumentRow: kind badge, title, meta line, and the three action buttons of a row with a file. */
export default function DocumentRowSkeleton() {
  return (
    <div data-testid="document-row-skeleton" className="flex items-start justify-between gap-3 p-3 border rounded-lg">
      <div className="flex-1 min-w-0 space-y-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-4 w-3/4 max-w-xs" />
        <Skeleton className="h-3 w-1/2 max-w-[10rem]" />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Skeleton className="h-11 w-11 rounded" />
        <Skeleton className="h-11 w-11 rounded" />
        <Skeleton className="h-11 w-11 rounded" />
      </div>
    </div>
  );
}
