import type { DocumentStatus } from "../types/document/DocumentStatus";

/** One name for each status, wherever it is shown or chosen. */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  duplicate: "Duplicate",
  processing: "Processing",
  extracting: "Extracting",
  skipped: "Skipped",
  deleted: "Deleted",
};
