import type { TenantFilter } from "../types/TenantFilter";

export const TENANT_FILTERS: readonly { value: TenantFilter; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "everyone", label: "Everyone" },
];

export const TENANT_MESSAGES = {
  loading: "Loading your tenants",
  filterLabel: "Current tenants or everyone",
  couldntLoad: "I couldn't load your tenants.",
  tryAgain: "Try again",
  wantRetry: "Want me to try again?",
  noneHeading: "No tenants yet",
  noneBody: "When an applicant signs a lease, they'll show up here.",
  seeApplicants: "See applicants",
  noCurrentHeading: "No one is staying with you right now",
  noCurrentBody: "Past tenants are under Everyone.",
  seeEveryone: "See everyone",
  unnamed: "Unnamed tenant",
  active: "Active",
  ended: "Ended",
  expired: "Lease expired",
  section: "Tenancy",
  end: "End tenancy",
  ending: "Ending…",
  cancel: "Cancel",
  endBody: "I'll move them to Ended. This doesn't message them or change their lease, and you can restart it later.",
  reason: "Reason (optional)",
  restart: "Restart tenancy",
  restarting: "Restarting…",
  restartFailed: "I couldn't restart the tenancy. Want me to try again?",
  endFailed: "I couldn't end the tenancy. Want me to try again?",
  noConnection: "I couldn't reach the server. Check your connection and try again.",
  changed: "That tenancy changed since you opened it. I've refreshed it.",
  expiredBody: "If they're staying, a new or extended lease will bring them back.",
  openLeases: "Add or extend a lease on the website",
} as const;

export function endTitle(name: string): string {
  return `End tenancy for ${name}?`;
}

export function endedToast(name: string): string {
  return `Tenancy ended for ${name}.`;
}

export function restartedToast(name: string): string {
  return `Tenancy restarted for ${name}.`;
}
