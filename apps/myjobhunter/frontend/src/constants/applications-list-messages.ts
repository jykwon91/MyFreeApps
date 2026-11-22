import { applicationsShowingCount } from "@myjobhunter/api-client/constants/applicationsListMessages";

export const APPLICATIONS_LIST_MESSAGES = {
  loadMore: "Load more",
  loadingMore: "Loading more...",
  tryAgain: "Try again",
  couldntLoadMore: "Couldn't load more applications.",
  showingCount: applicationsShowingCount,
} as const;
