import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { SyncLog } from "../types/integration/sync-log";

/**
 * True while a sync is running or any email is still waiting to be fetched or
 * read. Pass whichever of the two lists the caller has; a missing list counts
 * as no work.
 */
export function isSyncInFlight(logs: readonly SyncLog[] | undefined, queue: readonly EmailQueueItem[] | undefined): boolean {
  return (
    (logs ?? []).some((log) => log.status === "running") ||
    (queue ?? []).some((item) => item.status === "pending" || item.status === "fetched" || item.status === "extracting")
  );
}
