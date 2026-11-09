/**
 * Allowed kinds for an insurance policy attachment.
 *
 * Mirrors backend tuple ``INSURANCE_ATTACHMENT_KINDS`` in
 * ``app/core/insurance_enums.py``.
 */
export type InsuranceAttachmentKind =
  | "policy_document"
  | "endorsement"
  | "binder"
  | "other";
