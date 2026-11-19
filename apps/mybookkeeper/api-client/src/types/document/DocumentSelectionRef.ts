import type { DocumentStatus } from "./DocumentStatus";

/** A document "select all" can tick without loading it, from GET /documents/selection. */
export interface DocumentSelectionRef {
  id: string;
  status: DocumentStatus;
}
