import type { LeaseAttachmentKind } from "../types/lease/lease-attachment-kind";
import type { SignedLeaseStatus } from "../types/lease/signed-lease-status";

/** Mirrors the tuples in ``app/core/lease_enums.py``: keep both in sync. */
export const SIGNED_LEASE_STATUS_LABELS: Record<SignedLeaseStatus, string> = {
  draft: "Draft",
  generated: "Generated",
  sent: "Sent",
  signed: "Signed",
  active: "Active",
  ended: "Ended",
  terminated: "Terminated",
};

/**
 * The statuses a lease can move to. Mirrors ``_ALLOWED_TRANSITIONS`` in
 * ``backend/app/services/leases/_lease_helpers.py``: the server refuses anything else.
 * Staying on the same status is a no-op, so it isn't listed.
 */
export const SIGNED_LEASE_STATUS_NEXT: Record<SignedLeaseStatus, readonly SignedLeaseStatus[]> = {
  draft: ["generated"],
  generated: ["sent", "signed"],
  sent: ["signed"],
  signed: ["active"],
  active: ["ended", "terminated"],
  ended: [],
  terminated: [],
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

export const LEASE_PAGE_SIZE = 25;
