import type { PlaceholderProvenance } from "@mybookkeeper/api-client/types/lease/placeholder-provenance";
import type { KeyboardTypeOptions } from "react-native";

export const NEW_LEASE_APPLICANT_LIMIT = 100;
export const NEW_LEASE_SKELETON_FIELDS = ["a", "b", "c", "d", "e"];
/** Route names of the flow's screens, for leaving all of them at once. */
export const NEW_LEASE_SCREEN_PREFIX = "leases/new/";

/** Keyed by the input type as the server names it; one it doesn't know gets the plain keyboard. */
export const PLACEHOLDER_KEYBOARDS: Readonly<Record<string, KeyboardTypeOptions | undefined>> = {
  email: "email-address",
  phone: "phone-pad",
  number: "decimal-pad",
};

export const NEW_LEASE_MESSAGES = {
  newLease: "New lease",
  useTemplate: "Use this template",
  whichTemplates: "Which templates should I use?",
  pickOrder: "If two use the same field, the first one you pick decides what goes in it.",
  whoFor: "Who is this lease for?",
  whatGoesIn: "What goes in my lease?",
  loadingApplicants: "Loading who's ready for a lease",
  loadingDetails: "Loading what I need for this lease",
  noTemplatesHeading: "I don't have any templates yet.",
  noTemplatesBody: "Upload one on the website, and I can use it here.",
  openWebsite: "Open on the website",
  noApplicantsHeading: "Nobody's ready for a lease yet.",
  noApplicantsBody: "Move someone to Approved first.",
  couldntLoadTemplates: "I couldn't load your templates. Want me to try again?",
  couldntLoadApplicants: "I couldn't load who's ready for a lease. Want me to try again?",
  couldntLoadDetails: "I couldn't load what I need for this lease. Want me to try again?",
  checkConnection: "Check your connection and try again.",
  cantFindHeading: "I can't find that person or one of those templates.",
  cantFindBody: "They may have been deleted.",
  tryAgain: "Try again",
  goBack: "Go back",
  moreThanShown: "There are more than I can show here.",
  seeAllOnWebsite: "See them all on the website",
  seeEarlier: "See the earlier lease",
  followsEarlier: "I'm making a new lease to follow the earlier one.",
  nothingToFill: "There's nothing for me to fill in. I'll make the draft as is.",
  workedOut: "Worked out when the files are made:",
  needMoreAnswers: "I need a few more answers.",
  createDraft: "Create draft lease",
  creatingDraft: "Creating draft…",
  reset: "Reset to what I pulled",
  resetTitle: "Reset to what I pulled?",
  resetBody: "Your edits will be gone.",
  resetConfirm: "Reset",
  keepEdits: "Keep my edits",
  discardTitle: "Discard this lease?",
  discardBody: "I won't keep what you've changed here.",
  keepEditing: "Keep editing",
  discard: "Discard",
  invalidParent: "I can't start a new lease from that one right now.",
  newerExists: "That lease already has a newer one, so I opened it.",
  newerExistsNotFound: "That lease already has a newer one. Open the earlier lease to find it.",
  notFound: "I couldn't find one of those templates.",
  unsure: "I didn't hear back, so I'm not sure the draft was made. Check their leases before trying again.",
  refused: "That didn't go through, so I didn't make the draft. Want to try again?",
  changedSince: "Something changed on the website since I loaded this. I've pulled it again, so check what I need.",
  makeFiles: "Make the lease files",
  remakeFiles: "Make the lease files again",
  makingFiles: "Making the files…",
  madeFiles: "I made the lease files.",
  makeFilesFailed: "I couldn't make the lease files. Want to try again?",
  storageDown: "I can't save lease files right now. Try again in a bit.",
  makeAndEmail: "Make and email",
} as const;

export function continueWithTemplates(count: number): string {
  return `Continue with ${count} ${count === 1 ? "template" : "templates"}`;
}

export function selectedLabel(position: number): string {
  return `Selected #${position}`;
}

export function draftMade(templateCount: number): string {
  return templateCount > 1 ? `I made the draft with ${templateCount} documents.` : "I made the draft.";
}

export function leaseFor(name: string, templateNames: string[]): string {
  return templateNames.length > 0 ? `For ${name}, from ${templateNames.join(", ")}` : `For ${name}`;
}

export function usedIn(templateNames: string[]): string {
  return `Used in ${templateNames.join(", ")}`;
}

export function makeAndEmailTitle(name: string | null): string {
  return name ? `Make the files and email ${name}?` : "Make the files and email the tenant?";
}

export const MAKE_AND_EMAIL_BODY = "This lease is set to email the tenant once its files are made, if they have an email on file and email is set up. An email can't be unsent.";

export const PROVENANCE_CAPTIONS: Readonly<Record<NonNullable<PlaceholderProvenance>, string>> = {
  applicant: "From their application",
  inquiry: "From their inquiry",
  today: "Today's date",
  manual: "Edited by you",
};
