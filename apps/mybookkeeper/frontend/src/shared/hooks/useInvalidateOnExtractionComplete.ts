import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/shared/store/hooks";
import { baseApi } from "@/shared/store/baseApi";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";

/**
 * Watches the email queue for items transitioning out of the "extracting" state
 * (to "done" or "failed") and invalidates cached data that depends on extracted
 * transactions (Summary, Transaction, Document). This closes the cache-staleness
 * gap between background extraction completion and dashboard/reporting views.
 */
export function useInvalidateOnExtractionComplete(queue: readonly EmailQueueItem[]): void {
  const dispatch = useAppDispatch();
  const previousExtractingIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentlyExtracting = new Set<string>();
    for (const item of queue) {
      if (item.status === "extracting") currentlyExtracting.add(item.id);
    }

    const previous = previousExtractingIds.current;
    let transitioned = false;
    for (const id of previous) {
      if (!currentlyExtracting.has(id)) {
        // This id was extracting last tick and no longer is — extraction finished
        // (either "done" with new transactions, or "failed"). Refresh dependents.
        transitioned = true;
        break;
      }
    }

    if (transitioned) {
      dispatch(baseApi.util.invalidateTags(["Summary", "Transaction", "Document"]));
    }

    previousExtractingIds.current = currentlyExtracting;
  }, [queue, dispatch]);
}
