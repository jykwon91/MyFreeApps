export const TAX_DOCUMENTS_SKELETON_ROWS = [0, 1, 2, 3] as const;

export const TAX_DOCUMENTS_MESSAGES = {
  loading: "Loading tax documents",
  readNote: "Forms show up here once I've read them.",
  stillWaiting: "Still waiting on",
  addIt: "Add it",
  addDocument: "Add a document",
  unnamed: "Document",
  tryAgain: "Try again",
  checkConnection: "Check your connection.",
  tryAgainLater: "Please try again in a bit.",
  noneBodyWriter: "Add a W-2 or 1099 and I'll file it here.",
  noneBodyViewer: "They'll show up here once someone adds one.",
  couldntLoad: (year: number) => `I couldn't load your ${year} tax documents.`,
  noneHeading: (year: number) => `I don't have any tax documents for ${year} yet.`,
} as const;
