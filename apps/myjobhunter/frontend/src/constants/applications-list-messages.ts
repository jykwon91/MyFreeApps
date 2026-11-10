export const APPLICATIONS_LIST_MESSAGES = {
  loadMore: "Load more",
  loadingMore: "Loading more...",
  tryAgain: "Try again",
  couldntLoadMore: "Couldn't load more applications.",
  showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} applications`,
} as const;
