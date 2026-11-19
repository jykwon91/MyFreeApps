import type { DocumentListView } from "./DocumentListView";

/** Which documents a paged list (and its "select all") asks the server for, and in what order. */
export interface DocumentPageArgs extends DocumentListView {
  /** Only what the library holds: none still being read, no duplicate, none deleted. */
  excludeProcessing?: boolean;
  /** Only the ones that need a look: failed or a duplicate. */
  needsReview?: boolean;
}
