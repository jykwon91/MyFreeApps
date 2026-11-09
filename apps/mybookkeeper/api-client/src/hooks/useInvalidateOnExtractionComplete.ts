import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { EMAIL_DERIVED_TAGS } from "../constants/emailDerivedTags";
import { integrationsApi } from "../store/integrationsApi";
import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { ExtractionSnapshot } from "../types/integration/extraction-snapshot";
import { INITIAL_EXTRACTION_SNAPSHOT, observeExtraction } from "../utils/observeExtraction";

/**
 * Watches the email queue for extraction work finishing and invalidates every
 * cache that derives from extracted data (see EMAIL_DERIVED_TAGS), so pending
 * receipts, reconciliation and the dashboard don't stay stale until a manual
 * refresh. How completion is detected is documented on `observeExtraction`.
 * Pass `undefined` while the queue hasn't loaded.
 */
export function useInvalidateOnExtractionComplete(queue: readonly EmailQueueItem[] | undefined): void {
  const dispatch = useDispatch();
  const snapshot = useRef<ExtractionSnapshot>(INITIAL_EXTRACTION_SNAPSHOT);

  useEffect(() => {
    if (!queue) return;
    const observation = observeExtraction(snapshot.current, queue);
    snapshot.current = observation.snapshot;
    if (observation.completed) dispatch(integrationsApi.util.invalidateTags(EMAIL_DERIVED_TAGS));
  }, [queue, dispatch]);
}
