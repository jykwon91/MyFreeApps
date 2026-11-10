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
  noneBody: "Upload a Word, Markdown or text file with placeholders like [TENANT FULL NAME], and I'll fill them in for each applicant.",
  noneViewOnlyBody: "Someone with edit access can upload them.",
  add: "New template",
  moreThanShown: "Showing your first 100 templates.",
  openWebsite: "Open on the website",
  openOneOnWebsite: "Open this template on the website",
  files: "Files",
  noFiles: "This template has no files.",
  open: "Open",
  couldntOpen: "I couldn't open that file. Want to try again?",
  noFileLink: "I can't open this file right now.",
  fileMissing: "This file is missing. Upload the template again.",
  placeholders: "Placeholders",
  noPlaceholders: "This template has no placeholders.",
  reviewPlaceholders: "Review and edit placeholders",
  seePlaceholders: "See placeholders",
  delete: "Delete template",
  deleting: "Deleting…",
  deleteBody: "Leases you already made from it are kept. You can't undo this in the app.",
  deleted: "Template deleted.",
  alreadyDeleted: "That template was already deleted.",
} as const;

export function deleteTemplateTitle(name: string): string {
  return `Delete "${name}"?`;
}
