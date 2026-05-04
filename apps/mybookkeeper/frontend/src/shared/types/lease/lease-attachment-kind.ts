/**
 * Allowed kinds for a signed-lease attachment.
 *
 * Mirrors backend tuple ``LEASE_ATTACHMENT_KINDS`` in
 * ``app/core/lease_enums.py``.
 */
export type LeaseAttachmentKind =
  | "rendered_original"
  | "signed_lease"
  | "signed_addendum"
  | "move_in_inspection"
  | "move_out_inspection"
  | "insurance_proof"
  | "amendment"
  | "notice"
  | "rent_receipt"
  | "other";

export const LEASE_ATTACHMENT_KINDS: readonly LeaseAttachmentKind[] = [
  "rendered_original",
  "signed_lease",
  "signed_addendum",
  "move_in_inspection",
  "move_out_inspection",
  "insurance_proof",
  "amendment",
  "notice",
  "rent_receipt",
  "other",
] as const;
