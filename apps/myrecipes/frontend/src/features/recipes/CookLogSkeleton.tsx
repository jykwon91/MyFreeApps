import { LoadingRegion, Skeleton } from "@platform/ui";
import { COOK_LOG_MESSAGES } from "@myrecipes/api-client/constants/cookLog";

/** The cook log's rows while it loads: the date, version and stars line, the notes, and the delete button. */
export default function CookLogSkeleton() {
  return (
    <LoadingRegion label={COOK_LOG_MESSAGES.loading} className="space-y-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <Skeleton className="h-9 w-9" />
        </div>
      ))}
    </LoadingRegion>
  );
}
