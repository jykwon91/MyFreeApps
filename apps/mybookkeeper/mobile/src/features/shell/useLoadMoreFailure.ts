import { useState } from "react";

/** Remembers that the last load-more failed, so the list stops asking until the person retries. */
export function useLoadMoreFailure(loadNext: () => Promise<boolean>): {
  loadMoreFailed: boolean;
  loadMore: () => Promise<void>;
  clearLoadMoreFailure: () => void;
} {
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  async function loadMore(): Promise<void> {
    setLoadMoreFailed(await loadNext());
  }

  return { loadMoreFailed, loadMore, clearLoadMoreFailure: () => setLoadMoreFailed(false) };
}
