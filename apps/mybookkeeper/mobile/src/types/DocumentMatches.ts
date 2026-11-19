import type { DocumentSelectionRef } from "@mybookkeeper/api-client/types/document/DocumentSelectionRef";

/** Every document the search and filters matched, as of one check of the list. */
export interface DocumentMatches {
  /** The filters and how many times the list had come back changed: the check it answers. */
  checkKey: string;
  refs: readonly DocumentSelectionRef[];
}
