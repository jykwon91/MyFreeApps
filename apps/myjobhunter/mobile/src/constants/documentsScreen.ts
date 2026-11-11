/** Copy for the Documents list. The empty state words it as the website does. */
export const DOCUMENTS_SCREEN_MESSAGES = {
  screenTitle: "Documents",
  backTitle: "More",
  subtitle: "Cover letters, resumes, job descriptions, and more.",
  loadingList: "Loading your documents",
  couldntLoadList: "I couldn't load your documents.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  noneHeading: "No documents yet",
  noneBody: "Start by uploading a document or writing a cover letter draft.",
  noneOfKindHeading: (kind: string) => `No ${kind} documents`,
  noneOfKindBody: "Try another type, or upload one.",
  showAllTypes: "Show all types",
  kindFilter: "Type",
  kindSheetTitle: "Show documents of type",
} as const;

/** The subtitle's line, fixed so its skeleton stands exactly as tall. */
export const SUBTITLE_LINE_HEIGHT = 20;

/** One per card the skeleton shows while the list loads. */
export const DOCUMENT_SKELETON_CARDS = ["a", "b", "c", "d"] as const;
