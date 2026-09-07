import { useEffect, useRef } from "react";
import { useAppDispatch } from "@/shared/store/hooks";
import { baseApi } from "@/shared/store/baseApi";
import { EMAIL_DERIVED_TAGS } from "@/shared/store/emailDerivedTags";
import type { EmailQueueItem } from "@/shared/types/integration/email-queue";

const TERMINAL: ReadonlySet<EmailQueueItem["status"]> = new Set(["done", "failed"]);

/**
 * Watches the email queue for extraction work finishing and invalidates every
 * cache that derives from extracted data (see EMAIL_DERIVED_TAGS). This closes
 * the staleness gap between background extraction completing and the user
 * navigating to a page that shows the results.
 *
 * Completion is detected two ways, because either alone has a blind spot:
 *
 *  1. An id that was "extracting" no longer is (finished, or left the queue).
 *  2. An id reached a terminal status ("done"/"failed") that it did not hold on
 *     the previous observation. Signal 1 alone misses items that pass through
 *     "extracting" entirely between two polls — which happens whenever polling
 *     is slow, i.e. everywhere except the Integrations page.
 *
 * The first observation only seeds the baseline; it never invalidates, so
 * mounting on an already-settled queue costs nothing.
 */
export function useInvalidateOnExtractionComplete(queue: readonly EmailQueueItem[]): void {
  const dispatch = useAppDispatch();
  const previousExtractingIds = useRef<Set<string>>(new Set());
  const previousTerminalIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    const currentlyExtracting = new Set<string>();
    const currentlyTerminal = new Set<string>();
    for (const item of queue) {
      if (item.status === "extracting") currentlyExtracting.add(item.id);
      else if (TERMINAL.has(item.status)) currentlyTerminal.add(item.id);
    }

    let completed = false;
    for (const id of previousExtractingIds.current) {
      if (!currentlyExtracting.has(id)) {
        completed = true;
        break;
      }
    }
    if (!completed && seeded.current) {
      for (const id of currentlyTerminal) {
        if (!previousTerminalIds.current.has(id)) {
          completed = true;
          break;
        }
      }
    }

    previousExtractingIds.current = currentlyExtracting;
    previousTerminalIds.current = currentlyTerminal;
    seeded.current = true;

    if (completed) dispatch(baseApi.util.invalidateTags(EMAIL_DERIVED_TAGS));
  }, [queue, dispatch]);
}
