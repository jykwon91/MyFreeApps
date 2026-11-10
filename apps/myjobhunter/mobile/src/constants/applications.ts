export const APPLICATION_MESSAGES = {
  loadingList: "Loading your applications",
  couldntLoadList: "I couldn't load your applications.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  noneHeading: "No applications yet",
  noneBody: "Add your first one on the website and I'll keep track of where things stand.",
  addOnWebsite: "Add on the website",
  unknownCompany: "Unknown company",
  applied: "Applied",
  fit: "fit",
  sort: "Sort",
  sortTitle: "Sort applications by",
  opensOnWebsite: "Opens this application on the website",
  loadingMore: "Loading more applications",
  couldntLoadMore: "I couldn't load the rest of your applications.",
} as const;

/** Skeleton rows under the list while the next page loads. */
export const APPLICATION_FOOTER_SKELETON_ROWS = ["a", "b"] as const;

/** How close to the end of the list (in screen heights) the next page starts loading. */
export const LOAD_MORE_THRESHOLD = 0.5;

/** One per row the skeleton shows while the list loads. */
export const APPLICATION_SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"] as const;
