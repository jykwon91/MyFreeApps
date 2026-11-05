export const RECONCILIATION_SKELETON_ROWS = ["a", "b", "c"];
export const TAX_YEARS_OFFERED = 3;
export const MAX_REPORTED_AMOUNT = 10_000_000_000;
export const ISSUER_MAX_LENGTH = 255;
export const DEFAULT_SOURCE_TYPE = "1099_k";

export const SOURCE_TYPES = [
  { value: "1099_k", label: "1099-K" },
  { value: "1099_misc", label: "1099-MISC" },
  { value: "1099_nec", label: "1099-NEC" },
  { value: "year_end_statement", label: "Year-End Statement" },
];

export const RECONCILIATION_MESSAGES = {
  loading: "Loading your 1099s",
  couldntLoad: "I couldn't load your 1099s.",
  checkConnection: "Check your connection and try again.",
  tryAgain: "Try again",
  viewOnly: "You have view-only access, so you can look but not change these.",
  taxYear: "Tax year",
  taxYearHint: "Shows the 1099s for another year",
  filterLabel: "Which 1099s to show",
  all: "All",
  needsLook: "Needs a look",
  add: "Add a 1099",
  addHint: "Opens a form",
  compare: "Compare with my records",
  comparing: "Comparing…",
  compareHint: "Adds up your approved, tax-relevant income from each issuer and checks it against the form",
  noneBodyWriter: "Add one and I'll compare it with your records.",
  noneBodyViewer: "When someone adds one, it shows up here.",
  nothingNeedsLook: "Nothing here needs a look.",
  taxForm: "Tax form",
  reported: "Reported",
  inMyRecords: "In my records",
  notMatched: "Not matched",
  partlyMatched: "Partly matched",
  matched: "Matched",
  confirmed: "Confirmed",
  nothingFound: "I couldn't find matching income. Each form needs an issuer name that matches your transactions.",
  viewerRefused: "You have view-only access, so I can't do that.",
  compareUnreachable: "I can't reach the server. Trying again is safe.",
  compareFailed: "I couldn't compare them. Want to try again?",
  type: "Type",
  issuer: "Issuer (optional)",
  issuerHint: "Use the name on your transactions, like Airbnb, so I can compare them.",
  amount: "Amount reported (USD)",
  tooLarge: "That's more than I can save. Check the amount.",
  adding: "Adding…",
  added: "Added. Compare it with your records to see if it matches.",
  addRejected: "I couldn't save that. Check the amount and try again.",
  addUnreachable: "I can't reach the server, so I'm not sure that saved. Go back and check the list before adding it again.",
  addFailed: "I couldn't save that. Want to try again?",
  discardTitle: "Discard your changes?",
  discardBody: "I haven't saved them yet.",
  keepEditing: "Keep editing",
  discard: "Discard",
} as const;
