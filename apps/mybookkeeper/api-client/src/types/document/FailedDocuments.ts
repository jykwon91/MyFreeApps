import type { Document } from "./document";

/** How many documents failed to read across the workspace, and the newest of them, for the failed notice. */
export interface FailedDocuments {
  count: number;
  newest: Document | undefined;
}
