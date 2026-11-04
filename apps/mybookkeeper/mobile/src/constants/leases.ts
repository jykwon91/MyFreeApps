import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { LeaseFilter } from "../types/LeaseFilter";

export const LEASE_FILTERS: readonly { value: LeaseFilter; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "ended", label: "Ended" },
  { value: "all", label: "All" },
];

export const LEASE_MESSAGES = {
  filterLabel: "Current, ended or all leases",
  loading: "Loading your leases",
  loadingOne: "Loading this lease",
  couldntLoad: "I couldn't load your leases.",
  couldntLoadOne: "I couldn't load this lease.",
  couldntLoadTheirs: "I couldn't load their leases.",
  checkConnection: "Check your connection and try again.",
  tryAgain: "Try again",
  goneHeading: "That lease is gone",
  goneBody: "It may have been deleted.",
  goneWhileAdding: "That lease is gone, so I couldn't add the file.",
  goBack: "Go back",
  noCurrentHeading: "No current leases",
  noCurrentBody: "Signed and active leases show up here.",
  noEndedHeading: "No ended leases",
  noEndedBody: "Leases that ended or were terminated show up here.",
  seeAll: "See all leases",
  noneHeading: "No leases yet",
  noneBody: "Add one on the website. Its dates and files show up here.",
  openWebsite: "Open on the website",
  manageOnWebsite: "Manage on the website",
  section: "Leases",
  term: "Term",
  noDates: "No dates yet",
  signedCopy: "Signed copy",
  noSignedCopy: "No signed copy yet.",
  addSignedCopy: "Add the signed copy",
  addFile: "Add a file",
  fileKind: "What is it?",
  takePhoto: "Take a photo of the paper copy",
  saveFile: "Add file",
  uploading: "Uploading…",
  cancel: "Cancel",
  uploadFailed: "I couldn't upload that. Want me to try again?",
  tooBig: "That file is too big. Try a smaller PDF or a lower-resolution photo.",
  badFile: "I can't read that kind of file. Use a PDF, Word file, JPEG, PNG or WebP.",
  storageDown: "I couldn't save the file just now. It's still here, so try again in a bit.",
  otherFiles: "Other files",
  notes: "Notes",
  open: "Open",
  fileMissing: "This file is missing.",
  couldntOpen: "I couldn't open that file. Want to try again?",
  earlierLease: "See the earlier lease",
  newerLease: "See the newer lease",
  unnamedTenant: "Tenant",
  changeStatus: "Change status",
  changingStatus: "Changing…",
  statusSheetTitle: "Move to which status?",
  finalStatusBody: "This is final. You can't change it back.",
  notNow: "Not now",
  statusFailed: "I couldn't change the status. Want to try again?",
  statusMovedOn: "This lease's status changed somewhere else. Here's the latest.",
  goneWhileChanging: "That lease is gone.",
  extend: "Extend lease",
  extending: "Extending…",
  newEndDate: "New end date",
  extensionNote: "Note (optional)",
  extensionNoteHint: "This note is printed on the addendum.",
  extendFailedNothingChanged: "That didn't go through. Nothing was changed.",
  extendNotSeen: "I don't see that change on the lease yet. Trying the same date again is safe.",
  extendUnsure: "I can't reach the server, so I can't tell if that went through. Trying the same date again is safe.",
  extendWrongStatus: "This lease is no longer signed or active, so it can't be extended.",
  extendNoEndDate: "This lease has no end date yet. Add the original term on the website, then extend.",
  extendCheckFields: "Check the date and note, then try again.",
  extendNoEmail: "This tenant has no email on file. Nothing was changed.",
  noEmailOnFile: "This tenant has no email on file, so I can't email them the addendum.",
  extendAndEmail: "Extend and email",
  undoExtension: "Undo extension",
  undoingExtension: "Undoing…",
  undoTitle: "Undo this extension?",
  undoExpired: "This extension is more than 30 days old, so it can't be undone any more.",
  undoNotLatest: "A newer extension was added. Open the lease again to undo the latest one.",
  undoAlreadyDone: "That extension was already undone.",
  undoFailed: "I couldn't undo the extension. Want to try again?",
} as const;

/** The rendered original and rent receipts come from the app itself. */
export const LEASE_UPLOAD_KINDS: readonly LeaseAttachmentKind[] = [
  "signed_lease",
  "signed_addendum",
  "move_in_inspection",
  "move_out_inspection",
  "insurance_proof",
  "amendment",
  "notice",
  "other",
];

export const LEASE_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const LEASE_PHOTO_NAME = "lease-photo.jpg";

export const EXTENSION_NOTE_MAX_LENGTH = 2000;

export function addedFile(name: string): string {
  return `Added ${name}.`;
}

export function markAs(label: string): string {
  return `Mark as ${label.toLowerCase()}`;
}

export function markedAs(label: string): string {
  return `Marked as ${label.toLowerCase()}.`;
}

export function extendContext(endsOn: string): string {
  return `Ends ${endsOn} now. I'll create an extension addendum PDF with signature lines and attach it to this lease.`;
}

export function pickDateAfter(endsOn: string): string {
  return `Pick a date after ${endsOn}.`;
}

export function extendedTo(endsOn: string): string {
  return `Lease extended to ${endsOn}.`;
}

export function extendedAndEmailing(endsOn: string): string {
  return `Lease extended to ${endsOn}. I'll email the addendum shortly.`;
}

export function extendedEmailUnknown(endsOn: string): string {
  return `Lease extended to ${endsOn}. I can't tell if the email went out.`;
}

export function emailAddendumLabel(name: string | null): string {
  return `Email ${name ?? "the tenant"} the addendum`;
}

export function extendAndEmailTitle(name: string | null): string {
  return `Extend and email ${name ?? "the tenant"}?`;
}

export function extendAndEmailBody(endsOn: string): string {
  return `The lease will end ${endsOn}. The addendum goes out by email, and an email can't be unsent.`;
}

export function alreadyEnds(endsOn: string): string {
  return `The lease already ends ${endsOn}. It may have been changed elsewhere. Pick a later date.`;
}

export function undoUntil(date: string): string {
  return `You can undo this until ${date}.`;
}

export function undoBody(from: string, to: string | null): string {
  const move = to ? `The end date goes back from ${from} to ${to}.` : `The end date goes back from ${from}.`;
  return `${move} The addendum PDF stays attached to the lease. If you sent it to the tenant, let them know yourself.`;
}

export function undoDone(to: string | null): string {
  return to ? `Extension undone. The lease ends ${to} again.` : "Extension undone.";
}

export function noLeaseFor(name: string): string {
  return `No lease for ${name} yet.`;
}

export function extendedLine(endsOn: string, on: string): string {
  return `Extended to ${endsOn} on ${on}`;
}
