export const LEASE_TEMPLATE_LIST_LIMIT = 100;
export const LEASE_TEMPLATE_SKELETON_ROWS = ["a", "b", "c", "d"];

/** Only these can be uploaded; `lease_template_service.ALLOWED_TEMPLATE_MIME_TYPES`. */
export const LEASE_TEMPLATE_FILE_KINDS: Readonly<Record<string, string>> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
  "text/markdown": "Markdown",
  "text/plain": "Text file",
};

export const LEASE_TEMPLATE_MESSAGES = {
  loadingList: "Loading your lease templates",
  loadingOne: "Loading this template",
  couldntLoadList: "I couldn't load your lease templates.",
  couldntLoadOne: "I couldn't load this template.",
  cantFind: "I can't find that template.",
  maybeDeleted: "It may have been deleted.",
  tryAgainOffer: "Want me to try again?",
  tryAgain: "Try again",
  back: "Back",
  noneHeading: "You don't have any lease templates.",
  noneBody: "Ones you upload on the website show up here.",
  openWebsite: "Open on the website",
  openListOnWebsite: "Open lease templates on the website",
  openOneOnWebsite: "Open this template on the website",
  manageOnWebsite: "I can't create or edit templates here yet. Open the website to change them.",
  moreOnWebsite: "There are more than I can show here. Open the website to see them all.",
  files: "Files",
  noFiles: "This template has no files.",
  open: "Open",
  couldntOpen: "I couldn't open that file. Want to try again?",
  noFileLink: "I can't open this file right now.",
  fileMissing: "This file is missing. Upload it again on the website.",
  placeholders: "Placeholders",
  noPlaceholders: "This template has no placeholders.",
} as const;
