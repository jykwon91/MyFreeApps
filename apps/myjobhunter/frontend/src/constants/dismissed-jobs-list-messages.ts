/** The Discovery Dismissed tab's list: its footer, and its error when it can't load at all. */
export const DISMISSED_JOBS_LIST_MESSAGES = {
  loadMore: "Load more",
  loadingMore: "Loading more...",
  tryAgain: "Try again",
  couldntLoadMore: "Couldn't load more dismissed jobs.",
  couldntLoad: "Couldn't load dismissed jobs.",
  retry: "Retry",
  showingCount: (shown: number, total: number) => `Showing ${shown} of ${total} dismissed jobs`,
} as const;
