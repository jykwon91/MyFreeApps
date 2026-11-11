import type { LoadMoreMessages } from "@platform/core/types/paging/load-more-messages";

export interface LoadMoreFooterProps {
  shown: number;
  total: number;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: () => void;
  messages: LoadMoreMessages;
}
