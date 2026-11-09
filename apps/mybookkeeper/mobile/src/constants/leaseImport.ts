import { LEASE_NOTES_MAX_LENGTH } from "@mybookkeeper/api-client/constants/leaseLabels";
import type { LeaseImportProblems } from "@mybookkeeper/api-client/types/lease/lease-import-problems";

/** The website lists the first hundred applicants and listings too. */
export const LEASE_IMPORT_CHOICE_LIMIT = 100;

export const LEASE_IMPORT_MESSAGES = {
  importLease: "Import a signed lease",
  title: "Import a signed lease",
  intro: "Use this for a lease that was signed outside the app. It's saved as signed, with the files you add.",
  tenant: "Who signed it?",
  tenantSheetTitle: "Who signed it?",
  tenantNone: "Not chosen yet",
  loadingTenants: "Loading your applicants",
  couldntLoadTenants: "I couldn't load your applicants. Want me to try again?",
  noTenants: "You don't have any applicants yet. Add one first, then import their lease.",
  tryAgain: "Try again",
  moreTenants: "Only your first 100 applicants are listed here.",
  listing: "Listing",
  listingNone: "No listing",
  listingSheetTitle: "Which listing?",
  loadingListings: "Loading your listings",
  listingsFailed: "I couldn't load your listings. You can still import without one.",
  startsOn: "Lease starts",
  endsOn: "Lease ends",
  notes: "Notes",
  notesPlaceholder: "Any context: signing date, where it came from.",
  files: "Files",
  filesHint: "The first file is the signed lease. Add PDF, Word, JPEG, PNG or WebP files.",
  signedLeaseTag: "Signed lease",
  noFiles: "No files yet.",
  takePhoto: "Take a photo of the paper copy",
  photoName: "lease-photo.jpg",
  submit: "Import lease",
  submitting: "Importing…",
  needTenant: "Choose who signed it.",
  needFiles: "Add at least one file.",
  endsBeforeStarts: "The end date can't be before the start date.",
  notesTooLong: `Notes can be at most ${LEASE_NOTES_MAX_LENGTH} characters.`,
  tooBig: "One of those files is too big. Try a smaller PDF or a lower-resolution photo.",
  badFile: "I can't read one of those files. Use a PDF, Word file, JPEG, PNG or WebP.",
  storageDown: "I can't save files right now. Try again in a bit.",
  goneTenant: "I can't find that applicant or listing anymore. It may have been deleted.",
  unsure: "I didn't hear back, so I'm not sure the lease was imported. Check your leases before trying again, so you don't end up with two.",
  refused: "That didn't go through, so I didn't import the lease. Want to try again?",
  viewOnly: "You have view-only access, so I can't import a lease.",
} as const;

/** What to say beside a field when the form can't be sent yet. */
export const LEASE_IMPORT_PROBLEM_MESSAGES: { [Key in keyof LeaseImportProblems]-?: string } = {
  applicantId: LEASE_IMPORT_MESSAGES.needTenant,
  endsOn: LEASE_IMPORT_MESSAGES.endsBeforeStarts,
  notes: LEASE_IMPORT_MESSAGES.notesTooLong,
  files: LEASE_IMPORT_MESSAGES.needFiles,
};

export function leaseImported(count: number): string {
  return `Lease imported with ${count} ${count === 1 ? "file" : "files"}.`;
}

export function notesLeft(count: number): string {
  return `${count} ${count === 1 ? "character" : "characters"} left`;
}
