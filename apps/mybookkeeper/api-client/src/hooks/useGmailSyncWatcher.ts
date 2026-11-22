import { integrationsApi, useGetEmailQueueQuery } from "../store/integrationsApi";
import type { GmailSyncWatchOptions } from "../types/integration/gmail-sync-watch-options";
import { gmailWatchPollInterval } from "../utils/gmailWatchPollInterval";
import { useInvalidateOnExtractionComplete } from "./useInvalidateOnExtractionComplete";

/**
 * App-level watcher that keeps everything built from extracted emails fresh,
 * whichever screen is showing.
 *
 * Gmail extraction runs in the background on the server, so it routinely
 * finishes after the user has left Integrations. If the queue were only read
 * there, leaving it would mean nothing ever reloaded, and pending receipts,
 * reconciliation and the dashboard would stay stale until a hard refresh.
 *
 * Mount it once, inside the signed-in shell. While extraction is in flight it
 * re-reads the queue every few seconds; RTK Query shares the request with any
 * screen subscribed to the same queue, so Integrations adds no extra reads.
 */
export function useGmailSyncWatcher(options: GmailSyncWatchOptions): void {
  // The rate has to be known before subscribing, so it comes from what is already cached.
  const cached = integrationsApi.endpoints.getEmailQueue.useQueryState(undefined, { skip: options.skip }).data;
  const { currentData } = useGetEmailQueueQuery(undefined, {
    skip: options.skip,
    pollingInterval: gmailWatchPollInterval(cached, options),
    skipPollingIfUnfocused: true,
  });

  useInvalidateOnExtractionComplete(currentData);
}
