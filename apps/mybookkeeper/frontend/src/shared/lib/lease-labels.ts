import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import type { BadgeColor } from "@/shared/components/ui/Badge";

/**
 * Display tables for the Leases domain.
 *
 * Mirrors backend tuples in ``app/core/lease_enums.py`` — keep both in sync
 * when statuses / kinds / input types are added.
 */

export const SIGNED_LEASE_STATUS_BADGE_COLORS: Record<SignedLeaseStatus, BadgeColor> = {
  draft: "gray",
  generated: "blue",
  sent: "blue",
  signed: "green",
  active: "green",
  ended: "gray",
  terminated: "red",
};

/** Why the import dialog can't send yet, for the fields that have a message of their own. */
export const LEASE_IMPORT_PROBLEM_MESSAGES = {
  ends_before_starts: "The end date can't be before the start date.",
  notes_too_long: "Notes are too long.",
} as const;

/** What is wrong with a value in the add-document form, beside its field. */
export const LEASE_PREFILL_PROBLEM_MESSAGES = {
  required: "This one is required.",
  not_a_number: "That isn't a number I can read. Use digits, like 1500 or 1,500.50.",
} as const;
