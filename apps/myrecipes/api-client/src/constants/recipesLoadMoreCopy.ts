import type { LoadMoreMessages } from "@platform/core/types/paging/load-more-messages";

/** Under the recipes list while more recipes are left to load, worded the same on the website and the phone. */
export const RECIPES_LOAD_MORE_MESSAGES: LoadMoreMessages = {
  showingCount: (shown, total) => `Showing ${shown} of ${total} recipes`,
  loadMore: "Show more",
  loadingMore: "Loading more…",
  couldntLoadMore: "Couldn't load more recipes.",
  tryAgain: "Try again",
};
