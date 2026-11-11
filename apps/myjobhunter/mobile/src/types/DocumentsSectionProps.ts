import type { Document } from "@myjobhunter/api-client/types/document/document";

export interface DocumentsSectionProps {
  applicationId: string;
  /** Undefined until the list has loaded. */
  documents: readonly Document[] | undefined;
  /** How many the application has in all; `documents` holds the pages loaded so far. */
  total: number;
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isLoadingMore: boolean;
  isLoadMoreError: boolean;
  onLoadMore: () => void;
  onRetry: () => void | Promise<void>;
}
