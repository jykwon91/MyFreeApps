export const TAX_REVIEW_SKELETON_ROWS = [0, 1, 2] as const;

export const TAX_REVIEW_MESSAGES = {
  loading: "Loading your tax review",
  note: "This is what I have so far. It can't tell you a return is ready to file, so check with your accountant.",
  outOfDate: "Something changed since I last added this up, so these numbers are out of date.",
  nothingToPointOut: "I don't have anything to point out on this form.",
  addDocument: "Add a document",
  tryAgain: "Try again",
  tryAgainLater: "Please try again in a bit.",
  checkConnection: "Check your connection.",
  noneBodyWriter: "Add a W-2 or 1099 and I'll show what I find.",
  noneBodyViewer: "I'll show what I find once someone adds a tax form.",
  noneHeading: (year: number) => `I don't have any tax forms for ${year} yet.`,
  couldntLoad: (year: number) => `I couldn't load your ${year} tax review.`,
  formCount: (count: number, year: number) => `I have ${count} ${count === 1 ? "form" : "forms"} for ${year}.`,
  openReturn: (year: number) => `Open the ${year} tax return`,
} as const;
