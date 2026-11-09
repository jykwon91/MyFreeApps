import { DEFAULT_DOCUMENT_VIEW } from "../constants/documentListView";
import type { Document } from "../types/document/document";
import type { DocumentListView } from "../types/document/DocumentListView";

/** True when nothing is chosen (no narrowing) or the value is one of the choices. A missing value counts as "". */
export function matchesChoice(value: string | null, chosen: readonly string[]): boolean {
  return chosen.length === 0 || chosen.includes(value ?? "");
}

function sortKey(entry: Document, field: DocumentListView["sortField"]): string {
  return entry[field] ?? "";
}

/** Narrows by file name, status, type and source, then orders, as the website's table does. */
export function viewDocuments(documents: readonly Document[], view: DocumentListView): Document[] {
  const term = view.search.trim().toLowerCase();
  const direction = view.sortDirection === "asc" ? 1 : -1;
  return documents
    .filter(
      (entry) =>
        (!term || (entry.file_name ?? "").toLowerCase().includes(term)) &&
        matchesChoice(entry.status, view.statuses) &&
        matchesChoice(entry.document_type, view.types) &&
        matchesChoice(entry.source, view.sources),
    )
    .sort((a, b) => direction * sortKey(a, view.sortField).localeCompare(sortKey(b, view.sortField)));
}

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
