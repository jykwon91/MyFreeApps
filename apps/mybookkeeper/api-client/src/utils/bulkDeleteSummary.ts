import type { BulkDeleteRun } from "../types/document/BulkDeleteRun";
import type { BulkDeleteSummary } from "../types/document/BulkDeleteSummary";

/** Counts a bulk-delete run: what went, what was already gone, the ids still being read and those that errored. */
export function summariseBulkDelete(run: BulkDeleteRun): BulkDeleteSummary {
  return {
    deleted: run.deleted.length,
    alreadyGone: run.skipped.filter((entry) => entry.reason === "not_found").length,
    beingReadIds: run.skipped.filter((entry) => entry.reason === "being_read").map((entry) => entry.id),
    failedIds: run.failedIds,
  };
}
