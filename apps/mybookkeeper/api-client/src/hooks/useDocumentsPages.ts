import { useInfinitePages } from "@platform/core/hooks/useInfinitePages";
import { useListDocumentPagesInfiniteQuery } from "../store/documentsApi";
import type { DocumentPageArgs } from "../types/document/DocumentPageArgs";
import type { DocumentPagesOptions } from "../types/document/DocumentPagesOptions";
import type { DocumentsPagesState } from "../types/document/DocumentsPagesState";

/** GET /documents/page a page at a time, narrowed and ordered by the server. Shared by the website and the phone. */
export function useDocumentsPages(args: DocumentPageArgs, options: DocumentPagesOptions = {}): DocumentsPagesState {
  const { items, ...pages } = useInfinitePages(
    useListDocumentPagesInfiniteQuery(args, { ...options, skipPollingIfUnfocused: true }),
  );
  return { ...pages, documents: items };
}
