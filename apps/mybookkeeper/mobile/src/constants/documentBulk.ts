import { deleteDocumentsBody } from "./documents";

export const DOCUMENT_BULK_MESSAGES = {
  select: "Select",
  selectLabel: "Select several documents",
  selectAll: "Select all",
  selectAllLabel: "Select all the documents shown",
  cancel: "Cancel",
  cancelLabel: "Stop selecting",
  delete: "Delete",
  deleting: "Deleting…",
  hintLongPress: "Press and hold to select several",
  offlineFailure: "I can't reach the server, so I couldn't delete those. They're still selected.",
  viewOnlyFailure: "You have read-only access, so I can't delete these.",
  otherFailure: "I couldn't delete those. Want to try again?",
} as const;

export function confirmDeleteBody(count: number): string {
  return deleteDocumentsBody(count);
}

export function selectedCountLabel(count: number): string {
  return count === 1 ? "1 selected" : `${count} selected`;
}

export function deleteSelectedLabel(count: number): string {
  return `Delete ${count} selected`;
}

export function confirmDeleteTitle(count: number): string {
  return count === 1 ? "Delete 1 document?" : `Delete ${count} documents?`;
}

export function stillBeingReadNote(count: number): string {
  return `${count === 1 ? "1 document is" : `${count} documents are`} still being read, so can't be selected yet.`;
}

export function hiddenSelectedNote(count: number): string {
  return `${count === 1 ? "1 more is" : `${count} more are`} hidden by your search or filters. ${count === 1 ? "It" : "They"} won't be deleted.`;
}

export function deletedMessage(deleted: number): string {
  return deleted === 1 ? "Deleted 1 document" : `Deleted ${deleted} documents`;
}

export function deletedSomeGoneMessage(deleted: number, alreadyGone: number): string {
  return `Deleted ${deleted}. ${alreadyGone === 1 ? "1 was" : `${alreadyGone} were`} already gone.`;
}

export function beingReadMessage(deleted: number, beingRead: number): string {
  const read = beingRead === 1 ? "1 is" : `${beingRead} are`;
  return `${deleted > 0 ? `Deleted ${deleted}. ` : ""}${read} still being read: try again once ${beingRead === 1 ? "it's" : "they're"} done.`;
}

export function deletedSomeFailedMessage(deleted: number, failed: number): string {
  return `Deleted ${deleted}. ${failed} couldn't be deleted — try again.`;
}
