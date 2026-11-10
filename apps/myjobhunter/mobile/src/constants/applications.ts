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
} as const;

/** One per row the skeleton shows while the list loads. */
export const APPLICATION_SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"] as const;
