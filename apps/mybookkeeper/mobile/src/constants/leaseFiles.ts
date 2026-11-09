import { LEASE_ATTACHMENT_KINDS } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";

/** Every kind the website's picker offers, so nothing a file can be marked as is out of reach. */
export const LEASE_FILE_KIND_CHOICES = LEASE_ATTACHMENT_KINDS;

export const LEASE_FILE_MESSAGES = {
  changeType: "Change type",
  changingType: "Changing…",
  typeSheetTitle: "What kind of file is this?",
  remove: "Remove",
  removing: "Removing…",
  removeBody: "The file is deleted for good. The lease itself stays.",
  removed: "File removed.",
  typeChanged: "File type changed.",
  backsExtension: "This addendum is the record of an extension. Undo the extension first.",
  allFiles: "Files",
  noFiles: "No files yet.",
} as const;

export function changeTypeLabel(filename: string): string {
  return `Change the type of ${filename}`;
}

export function removeLabel(filename: string): string {
  return `Remove ${filename}`;
}

export function removeTitle(filename: string): string {
  return `Remove ${filename}?`;
}
