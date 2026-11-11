export const DOCUMENTS_LIST_MESSAGES = {
  loadMore: "Load more",
  loadingMore: "Loading more...",
  tryAgain: "Try again",
  couldntLoadMore: "Couldn't load more documents.",
  couldntLoad: "Couldn't load documents. Please refresh.",
  showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} documents`,
} as const;
