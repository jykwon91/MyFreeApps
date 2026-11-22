import { SYNC_ACTIVE_POLL_INTERVAL_MS, SYNC_IDLE_POLL_INTERVAL_MS } from "../constants/syncPolling";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { GmailSyncWatchOptions } from "../types/integration/gmail-sync-watch-options";
import { isSyncInFlight } from "./isSyncInFlight";

/** How often the app-wide watcher re-reads the email queue; 0 means not at all. */
export function gmailWatchPollInterval(queue: readonly EmailQueueItem[] | undefined, options: GmailSyncWatchOptions): number {
  if (options.skip || !options.canPoll) return 0;
  if (isSyncInFlight(undefined, queue)) return SYNC_ACTIVE_POLL_INTERVAL_MS;
  return options.pollWhileIdle ? SYNC_IDLE_POLL_INTERVAL_MS : 0;
}
