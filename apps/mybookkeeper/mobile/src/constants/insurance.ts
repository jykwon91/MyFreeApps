export const POLICY_LIST_LIMIT = 100;
export const EXPIRES_SOON_DAYS = 90;
export const POLICY_SKELETON_ROWS = ["a", "b", "c", "d", "e"];

export const INSURANCE_MESSAGES = {
  loadingList: "Loading your insurance policies",
  loadingOne: "Loading this policy",
  couldntLoadList: "I couldn't load your insurance policies.",
  couldntLoadOne: "I couldn't load that policy.",
  cantFind: "I can't find that policy.",
  maybeDeleted: "It may have been deleted.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  back: "Back",
  noneHeading: "You don't have any insurance policies yet.",
  noneBody: "Add one on the website and it'll show up here.",
  openWebsite: "Open on the website",
  manageOnWebsite: "Adding and changing policies, rate watch and market comparisons are on the website.",
  moreOnWebsite: `I'm showing the first ${POLICY_LIST_LIMIT} policies. The rest are on the website.`,
  policyNumber: "Policy number",
  coverage: "Coverage",
  deductible: "Deductible",
  windHail: "Wind and hail deductible",
  premium: "Premium",
  term: "Term",
  notes: "Notes",
  documents: "Documents",
  noDocuments: "No documents saved for this policy.",
  open: "Open",
  couldntOpen: "I couldn't open that file. Want to try again?",
  fileMissing: "I can't find this file. Try opening it on the website.",
} as const;
