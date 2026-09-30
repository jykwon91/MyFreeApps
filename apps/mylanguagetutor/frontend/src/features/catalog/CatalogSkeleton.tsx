import { Skeleton } from "@platform/ui";

const PLACEHOLDER_ROWS = 4;

/** Mirrors the loaded Home layout: heading block + scenario rows. */
export default function CatalogSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading scenarios">
      <Skeleton className="h-7 w-2/3 max-w-sm" />
      <Skeleton className="h-4 w-1/2 max-w-xs" />
      <ul className="space-y-3">
        {Array.from({ length: PLACEHOLDER_ROWS }, (_, i) => (
          <li key={i} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
          </li>
        ))}
      </ul>
    </div>
  );
}
