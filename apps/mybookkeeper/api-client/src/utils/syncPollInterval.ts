import { SYNC_ACTIVE_POLL_INTERVAL_MS, SYNC_IDLE_POLL_INTERVAL_MS } from "../constants/syncPolling";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { SyncLog } from "../types/integration/sync-log";
import { isSyncInFlight } from "./isSyncInFlight";

/**
 * Poll fast while a sync is running or any email is waiting to be fetched or
 * read, and slowly when nothing is. Pass whichever of the two lists the caller
 * has; a missing list counts as no work.
 */
export function syncPollInterval(logs: readonly SyncLog[] | undefined, queue: readonly EmailQueueItem[] | undefined): number {
  return isSyncInFlight(logs, queue) ? SYNC_ACTIVE_POLL_INTERVAL_MS : SYNC_IDLE_POLL_INTERVAL_MS;
}
