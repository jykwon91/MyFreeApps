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

export function addedFile(name: string): string {
  return `Added ${name}.`;
}

export function noLeaseFor(name: string): string {
  return `No lease for ${name} yet.`;
}

export function extendedLine(endsOn: string, on: string): string {
  return `Extended to ${endsOn} on ${on}`;
}
