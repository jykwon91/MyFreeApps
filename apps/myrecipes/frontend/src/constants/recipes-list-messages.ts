import type { LoadMoreFooterProps } from "@platform/ui";

/** Under the recipes grid while more recipes are left to load. */
export const RECIPES_LIST_MESSAGES: LoadMoreFooterProps["messages"] = {
  showingCount: (shown, total) => `Showing ${shown} of ${total} recipes`,
  loadMore: "Load more",
  loadingMore: "Loading more...",
  couldntLoadMore: "Couldn't load more recipes.",
  tryAgain: "Try again",
};
