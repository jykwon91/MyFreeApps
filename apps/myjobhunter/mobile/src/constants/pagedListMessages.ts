import type { LoadMoreMessages } from "@platform/core/types/paging/load-more-messages";

/** Under any list the phone pages with "Show more": how many are showing, and the button's words. */
export const PAGED_LIST_MESSAGES: LoadMoreMessages = {
  showingCount: (shown, total) => `Showing ${shown} of ${total}`,
  loadMore: "Show more",
  loadingMore: "Loading more…",
  couldntLoadMore: "I couldn't load the rest of them.",
  tryAgain: "Try again",
};
