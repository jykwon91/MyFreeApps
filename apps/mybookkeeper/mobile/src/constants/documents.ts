import { DOCUMENT_LIST_LIMIT } from "@mybookkeeper/api-client/constants/documentListLimit";

export const POLL_INTERVAL_MS = 5000;
export const POLL_GIVE_UP_MS = 2 * 60 * 1000;
export const STILL_READING_MESSAGE = "Still working on this one. Pull down to check again.";

export const ALL_DOCUMENTS = {};

export const DOCUMENT_LIST_MESSAGES = {
  filters: "Filters",
  clearFilters: "Clear filters",
  nothingMatches: "Nothing matches that.",
  showFailed: "Show failed",
  dismiss: "Dismiss",
  reference: "Reference",
  tryAgain: "Try again",
  searchLabel: "Search documents",
  searchPlaceholder: "Search by file name",
  segmentsLabel: "Which documents to show",
  loadFailedHeading: "I couldn't load your documents.",
  loadFailedBody: "Want me to try again?",
  emptyHeading: "No documents yet",
  emptyBodyWriter: "Snap a receipt or invoice and I'll read it for you.",
  emptyBodyViewer: "They'll show up here once someone adds one.",
  takePhoto: "Take a photo",
  deletedStatusLine: "This document was deleted.",
  deletedFileNote: "The file is gone with it.",
} as const;

export function filtersButtonLabel(count: number): string {
  return count > 0 ? `${DOCUMENT_LIST_MESSAGES.filters} (${count})` : DOCUMENT_LIST_MESSAGES.filters;
}

export function filtersAccessibilityLabel(count: number): string {
  return count > 0 ? `${DOCUMENT_LIST_MESSAGES.filters}, ${count} on` : DOCUMENT_LIST_MESSAGES.filters;
}

export function documentCountLabel(shown: number, total: number): string {
  if (shown === total) return total === 1 ? "1 document" : `${total} documents`;
  return `${shown} of ${total} documents`;
}

/** The list is cut off at the server's limit, so the total isn't known and older ones aren't here. */
export function cappedListLabel(): string {
  return `Showing your newest ${DOCUMENT_LIST_LIMIT.toLocaleString("en-US")}`;
}

export function cappedSelectNote(): string {
  return `Select all covers the ${DOCUMENT_LIST_LIMIT.toLocaleString("en-US")} shown, not older ones.`;
}

/** One warning for deleting from the list and from a document's own screen. */
export function deleteDocumentsBody(count: number): string {
  return `${count === 1 ? "It'll" : "They'll"} be removed from your documents. The transactions I pulled from ${count === 1 ? "it" : "them"} stay in your books. This can't be undone.`;
}

export const REFERENCE_ONLY_MESSAGES = {
  mark: "Mark as reference-only",
  marking: "Marking…",
  unmark: "Unmark as reference-only",
  unmarking: "Unmarking…",
  offlineFailure: "I can't reach the server, so I couldn't update that. Want to try again?",
  otherFailure: "I couldn't update that document. Want to try again?",
} as const;

export const DOCUMENT_ACTION_MESSAGES = {
  alreadyGone: "That document is already gone.",
  stillBeingRead: "That document is still being read. Try again once it's done.",
  deleteFailed: "I couldn't delete that. Want to try again?",
  readAgainFailed: "I couldn't start over on that. Want to try again?",
} as const;
