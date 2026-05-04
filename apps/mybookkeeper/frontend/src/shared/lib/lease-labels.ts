import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";
import type { LeasePlaceholderInputType } from "@/shared/types/lease/lease-placeholder-input-type";
import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";
import type { BadgeColor } from "@/shared/components/ui/Badge";

/**
 * Display tables for the Leases domain.
 *
 * Mirrors backend tuples in ``app/core/lease_enums.py`` — keep both in sync
 * when statuses / kinds / input types are added.
 */

export const SIGNED_LEASE_STATUS_LABELS: Record<SignedLeaseStatus, string> = {
  draft: "Draft",
  generated: "Generated",
  sent: "Sent",
  signed: "Signed",
  active: "Active",
  ended: "Ended",
  terminated: "Terminated",
};

export const SIGNED_LEASE_STATUS_BADGE_COLORS: Record<SignedLeaseStatus, BadgeColor> = {
  draft: "gray",
  generated: "blue",
  sent: "blue",
  signed: "green",
  active: "green",
  ended: "gray",
  terminated: "red",
};

export const LEASE_ATTACHMENT_KIND_LABELS: Record<LeaseAttachmentKind, string> = {
  rendered_original: "Rendered original",
  signed_lease: "Signed lease",
  signed_addendum: "Signed addendum",
  move_in_inspection: "Move-in inspection",
  move_out_inspection: "Move-out inspection",
  insurance_proof: "Insurance proof",
  amendment: "Amendment",
  notice: "Notice",
  rent_receipt: "Rent receipt",
  other: "Other",
};

export const LEASE_PLACEHOLDER_INPUT_TYPE_LABELS: Record<
  LeasePlaceholderInputType,
  string
> = {
  text: "Text",
  email: "Email",
  phone: "Phone",
  date: "Date",
  number: "Number",
  computed: "Computed",
  signature: "Signature",
};

export const LEASE_PAGE_SIZE = 25;
