import { useAppSelector } from "@/shared/store/hooks";
import { integrationsApi, useGetEmailQueueQuery } from "@/shared/store/integrationsApi";
import { useInvalidateOnExtractionComplete } from "@/shared/hooks/useInvalidateOnExtractionComplete";
import { EMPTY_QUEUE } from "@/shared/lib/constants";

/** Poll fast while extraction work is in flight, slowly while the queue is idle. */
const ACTIVE_INTERVAL_MS = 5_000;
const IDLE_INTERVAL_MS = 60_000;

/** Hoisted so the selector identity is stable across renders. */
const selectEmailQueue = integrationsApi.endpoints.getEmailQueue.select();

/**
 * App-level watcher that keeps derived caches fresh no matter which page the
 * user is on.
 *
 * Gmail extraction runs in the background on the server, so it routinely
 * finishes after the user has navigated away from Integrations. Previously the
 * queue poll and the cache invalidation both lived on that page, so leaving it
 * meant nothing ever invalidated and every derived view — pending receipts,
 * reconciliation, the dashboard — stayed stale until a hard refresh.
 *
 * Mount this once in the authenticated Layout. It is cheap: while the queue is
 * idle it polls once a minute and not at all in a backgrounded tab, and RTK
 * Query dedupes against the Integrations page's own faster subscription to the
 * same endpoint (the lowest interval across subscribers wins), so being on that
 * page adds no extra requests.
 */
export function useGmailSyncWatcher(): void {
  // Read the already-cached queue so the poll rate is known before subscribing.
  // Deriving it from this hook's own result instead would need the value one
  // render before it exists.
  const cached = useAppSelector(selectEmailQueue).data ?? EMPTY_QUEUE;
  const hasActiveWork = cached.some(
    (item) => item.status === "extracting" || item.status === "fetched",
  );

  const { data: queue = EMPTY_QUEUE } = useGetEmailQueueQuery(undefined, {
    pollingInterval: hasActiveWork ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS,
    skipPollingIfUnfocused: true,
  });

  useInvalidateOnExtractionComplete(queue);
}
