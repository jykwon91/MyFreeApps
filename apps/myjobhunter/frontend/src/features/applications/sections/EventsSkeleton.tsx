import { LoadingRegion, Skeleton } from "@platform/ui";
import { APPLICATION_EVENTS_LOAD_MESSAGES as MESSAGES } from "@myjobhunter/api-client/constants/applicationEventsLoadMessages";

const PLACEHOLDER_ROWS = 3;

/** Stands in for the activity list while it loads: same bordered rows, badge and date on top, a note line below. */
export default function EventsSkeleton() {
  return (
    <LoadingRegion label={`${MESSAGES.loading}…`} className="space-y-2">
      {Array.from({ length: PLACEHOLDER_ROWS }).map((_, i) => (
        <div key={i} data-testid="event-row-skeleton" className="border rounded-lg p-3 bg-muted/20 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      ))}
    </LoadingRegion>
  );
}
