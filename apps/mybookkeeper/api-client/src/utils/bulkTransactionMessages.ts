import { formatCount } from "@platform/core/utils/count";
import type { BulkCountsRun } from "../types/bulk/BulkCountsRun";
import type { BulkOutcomeMessage } from "../types/bulk/BulkOutcomeMessage";

function withSkipped(verb: string, done: number, skipped: number): string {
  return `${verb} ${done}${skipped > 0 ? `, skipped ${skipped}` : ""}.`;
}

/** Fixed copy for a bulk approve over one or more batches; always says what the batches that went through did. Shared by the website and the phone. */
export function bulkApproveMessage(run: BulkCountsRun<"approved" | "skipped">): BulkOutcomeMessage {
  const { approved, skipped } = run.counts;
  if (run.failedIds.length > 0) {
    return approved + skipped > 0
      ? { text: `${withSkipped("Approved", approved, skipped)} The rest failed \u2014 try again.`, isError: true }
      : { text: "Failed to approve transactions", isError: true };
  }
  return { text: `${approved} approved${skipped > 0 ? `, ${skipped} skipped` : ""}`, isError: false };
}

/** Fixed copy for marking or unmarking capital improvements over one or more batches. */
export function bulkCapitalImprovementMessage(
  run: BulkCountsRun<"updated" | "skipped">,
  isMarking: boolean,
): BulkOutcomeMessage {
  const { updated, skipped } = run.counts;
  const verb = isMarking ? "Marked" : "Unmarked";
  if (run.failedIds.length > 0) {
    return updated + skipped > 0
      ? { text: `${withSkipped(verb, updated, skipped)} The rest failed \u2014 try again.`, isError: true }
      : { text: `Failed to ${isMarking ? "mark" : "unmark"} transactions`, isError: true };
  }
  const notExpenses = skipped > 0 ? `, ${skipped} skipped (only expenses can be marked)` : "";
  return { text: `${verb} ${formatCount(updated, "transaction")}${notExpenses}`, isError: false };
}

/** Fixed copy for a bulk delete over one or more batches; always says what the batches that went through did. Shared by the website and the phone. */
export function bulkDeleteMessage(run: BulkCountsRun<"deleted" | "skipped">): BulkOutcomeMessage {
  const { deleted, skipped } = run.counts;
  if (run.failedIds.length > 0) {
    return deleted + skipped > 0
      ? { text: `${withSkipped("Deleted", deleted, skipped)} The rest failed \u2014 try again.`, isError: true }
      : { text: "Failed to delete transactions", isError: true };
  }
  return { text: `${formatCount(deleted, "transaction")} deleted${skipped > 0 ? `, ${skipped} skipped` : ""}`, isError: false };
}
