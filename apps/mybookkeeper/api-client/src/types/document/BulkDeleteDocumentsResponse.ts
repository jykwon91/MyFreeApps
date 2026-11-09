import type { SkippedDocument } from "./SkippedDocument";

export interface BulkDeleteDocumentsResponse {
  deleted: string[];
  skipped: SkippedDocument[];
}
