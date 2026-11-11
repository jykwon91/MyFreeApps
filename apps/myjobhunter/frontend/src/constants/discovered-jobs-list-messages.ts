/** The Discovery Saved tab's list: its footer, and its error when it can't load at all. */
export const DISCOVERED_JOBS_LIST_MESSAGES = {
  loadMore: "Load more",
  loadingMore: "Loading more...",
  tryAgain: "Try again",
  couldntLoadMore: "Couldn't load more saved jobs.",
  couldntLoad: "Couldn't load saved jobs.",
  retry: "Retry",
  showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} saved jobs`,
} as const;
