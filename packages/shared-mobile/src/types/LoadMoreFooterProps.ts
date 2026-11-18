import type { LoadMoreMessages } from "@platform/core/types/paging/load-more-messages";
import type { PressHandler } from "./PressHandler";

export interface LoadMoreFooterProps {
  shown: number;
  total: number;
  isLoading: boolean;
  isError: boolean;
  onLoadMore: PressHandler;
  messages: LoadMoreMessages;
}
