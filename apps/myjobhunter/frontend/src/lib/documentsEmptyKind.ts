import type { DocumentsEmptyKind } from "@/types/documents-empty-kind";
import type { DocumentKindFilter } from "@myjobhunter/api-client/types/document/document-kind-filter";

/**
 * Which empty state the list needs. `total` is the server's count across every page, so a
 * list whose first page is empty is only empty when nothing matches at all.
 */
export function documentsEmptyKind(total: number, loadedCount: number, kindFilter: DocumentKindFilter): DocumentsEmptyKind {
  if (total > 0 || loadedCount > 0) return "none";
  return kindFilter === "all" ? "no-documents" : "no-matches";
}
