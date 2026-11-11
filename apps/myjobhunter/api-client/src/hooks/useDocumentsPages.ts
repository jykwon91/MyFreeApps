import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListDocumentsInfiniteQuery } from "../store/documentsApi";
import type { DocumentsFilter } from "../types/document/documents-filter";
import type { DocumentsPagesState } from "../types/document/documents-pages-state";

/** GET /documents a page at a time, newest first. Shared by the web page and the phone screen. */
export function useDocumentsPages(filter: DocumentsFilter): DocumentsPagesState {
  const { items, ...pages } = useInfinitePages(useListDocumentsInfiniteQuery(filter));
  return { ...pages, documents: items };
}
