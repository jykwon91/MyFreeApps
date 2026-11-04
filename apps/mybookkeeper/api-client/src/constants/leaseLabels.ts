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
