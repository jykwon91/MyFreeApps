import type { LoadMoreMessages } from "@platform/core/types/paging/load-more-messages";

export interface LoadMoreFooterProps {
  shown: number;
  total: number;
  hasNextPage: boolean;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: () => void;
  messages: LoadMoreMessages;
}
