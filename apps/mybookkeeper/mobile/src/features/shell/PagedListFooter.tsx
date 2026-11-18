import { LoadingRegion, type PressHandler } from "@platform/mobile";
import type { ReactNode } from "react";
import LoadMoreFailed from "./LoadMoreFailed";

interface PagedListFooterProps {
  isLoadingMore: boolean;
  loadingLabel: string;
  loadMoreFailed: boolean;
  onRetry: PressHandler;
  /** One row's worth of skeleton, shown while the next page loads. */
  skeletonRow: ReactNode;
}

/** Under a paged list: a skeleton row while the next page loads, or a retry when it failed. */
export default function PagedListFooter({ isLoadingMore, loadingLabel, loadMoreFailed, onRetry, skeletonRow }: PagedListFooterProps) {
  if (isLoadingMore) return <LoadingRegion label={loadingLabel}>{skeletonRow}</LoadingRegion>;
  if (loadMoreFailed) return <LoadMoreFailed onRetry={onRetry} />;
  return null;
}
