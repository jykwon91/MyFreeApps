import type { SkippedDocument } from "./SkippedDocument";

/** What running every bulk-delete batch came to, including the batches that never went through. */
export interface BulkDeleteRun {
  deleted: string[];
  skipped: SkippedDocument[];
  /** Ids in the batch that errored and in every batch after it, which were never sent. Safe to retry. */
  failedIds: string[];
  /** The error that stopped the run, or null when every batch went through. */
  error: unknown;
}
