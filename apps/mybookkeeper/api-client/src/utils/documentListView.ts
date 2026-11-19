import { DEFAULT_DOCUMENT_VIEW } from "../constants/documentListView";
import type { DocumentListView } from "../types/document/DocumentListView";

/** How many of the status, type and source choices are set, for a "Filters (2)" label. Search and order don't count. */
export function activeDocumentFilterCount(view: DocumentListView): number {
  return [view.statuses, view.types, view.sources].filter((chosen) => chosen.length > 0).length;
}

export function isDefaultDocumentView(view: DocumentListView): boolean {
  return (
    view.search === DEFAULT_DOCUMENT_VIEW.search &&
    activeDocumentFilterCount(view) === 0 &&
    view.sortField === DEFAULT_DOCUMENT_VIEW.sortField &&
    view.sortDirection === DEFAULT_DOCUMENT_VIEW.sortDirection
  );
}
