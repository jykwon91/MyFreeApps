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
  noSignedCopy: "No signed copy yet. Add one on the website.",
  otherFiles: "Other files",
  notes: "Notes",
  open: "Open",
  fileMissing: "This file is missing. Upload it again on the website.",
  couldntOpen: "I couldn't open that file. Want to try again?",
  earlierLease: "See the earlier lease",
  newerLease: "See the newer lease",
  unnamedTenant: "Tenant",
} as const;

export function noLeaseFor(name: string): string {
  return `No lease for ${name} yet.`;
}

export function extendedLine(endsOn: string, on: string): string {
  return `Extended to ${endsOn} on ${on}`;
}
