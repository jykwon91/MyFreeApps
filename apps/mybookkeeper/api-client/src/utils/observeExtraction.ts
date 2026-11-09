import type { EmailQueueItem } from "../types/integration/email-queue-item";
import type { ExtractionObservation } from "../types/integration/extraction-observation";
import type { ExtractionSnapshot } from "../types/integration/extraction-snapshot";

export const INITIAL_EXTRACTION_SNAPSHOT: ExtractionSnapshot = {
  extractingIds: new Set(),
  terminalIds: new Set(),
  seeded: false,
};

/**
 * Compares the queue with what an observer saw last time and says whether
 * extraction work finished in between.
 *
 * Completion is detected two ways, because either alone has a blind spot:
 *
 *  1. An id that was "extracting" no longer is (finished, or left the queue).
 *  2. An id reached a terminal status ("done"/"failed") that it did not hold on
 *     the previous observation. Signal 1 alone misses items that pass through
 *     "extracting" entirely between two polls, which happens whenever polling
 *     is slow.
 *
 * The first observation only seeds the baseline; it never reports completion,
 * so observing an already-settled queue costs nothing.
 */
export function observeExtraction(previous: ExtractionSnapshot, queue: readonly EmailQueueItem[]): ExtractionObservation {
  const extractingIds = new Set<string>();
  const terminalIds = new Set<string>();
  for (const item of queue) {
    if (item.status === "extracting") extractingIds.add(item.id);
    else if (item.status === "done" || item.status === "failed") terminalIds.add(item.id);
  }

  let completed = [...previous.extractingIds].some((id) => !extractingIds.has(id));
  if (!completed && previous.seeded) {
    completed = [...terminalIds].some((id) => !previous.terminalIds.has(id));
  }

  return { snapshot: { extractingIds, terminalIds, seeded: true }, completed };
}
