/** The Discovery inbox's list: its footer, and its error when it can't load at all. */
export const DISCOVERED_INBOX_LIST_MESSAGES = {
  loadMore: "Load more",
  loadingMore: "Loading more...",
  tryAgain: "Try again",
  couldntLoadMore: "Couldn't load more postings.",
  couldntLoad: "Couldn't load the inbox.",
  retry: "Retry",
  showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} postings`,
} as const;
