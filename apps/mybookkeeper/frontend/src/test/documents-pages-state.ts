import { vi } from "vitest";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { DocumentsPagesState } from "@mybookkeeper/api-client/types/document/DocumentsPagesState";

/** What `useDocumentsPages` returns once `documents` (every match, one page) have loaded. */
export function documentsPagesState(
  documents: readonly Pick<Document, "id" | "file_name">[],
  overrides: Partial<DocumentsPagesState> = {},
): DocumentsPagesState {
  return {
    documents: documents as Document[],
    total: documents.length,
    isLoading: false,
    hasData: true,
    isFiltering: false,
    loadError: undefined,
    error: undefined,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    isLoadMoreError: false,
    loadMore: vi.fn(),
    refetch: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}
