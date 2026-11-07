// "skipped": read, but nothing to record (a payment confirmation). "duplicate"
// becomes "deleted" in the same step: a transaction already holds what it says.
export const DOCUMENT_STATUSES = {
  PROCESSING: "processing",
  EXTRACTING: "extracting",
  COMPLETED: "completed",
  FAILED: "failed",
  DUPLICATE: "duplicate",
  SKIPPED: "skipped",
  DELETED: "deleted",
} as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[keyof typeof DOCUMENT_STATUSES];
