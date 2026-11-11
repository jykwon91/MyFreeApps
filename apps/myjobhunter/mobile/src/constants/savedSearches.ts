/** Copy for the saved searches above the postings, and what each one's buttons say. */
export const SAVED_SEARCH_MESSAGES = {
  heading: "Saved searches",
  loading: "Loading saved searches",
  couldntLoad: "I couldn't load your saved searches.",
  tryAgain: "Try again",
  fetchFailed: "Fetch failed",
  refresh: "Refresh",
  refreshing: "Fetching…",
  edit: "Edit",
  remove: "Remove",
  removing: "Removing…",
  savingFrequency: "Saving…",
  editFrequency: (cadence: string) => `Edit refresh frequency (currently ${cadence})`,
  frequencySheetTitle: "Refresh frequency",
  frequencySheetDescription: "How often this saved search fetches new postings on its own.",
  removeTitle: "Remove this saved search?",
  removeBody: "It stops fetching new postings. The postings it already found stay.",
  keep: "Keep",
  actionFor: (action: string, name: string) => `${action} ${name}`,
} as const;

/** One per row the saved searches' skeleton shows. */
export const SAVED_SEARCH_SKELETON_ROWS = ["a"] as const;

/** The panel heading's line, fixed so its skeleton stands exactly as tall. */
export const SAVED_SEARCHES_HEADING_LINE_HEIGHT = 18;
