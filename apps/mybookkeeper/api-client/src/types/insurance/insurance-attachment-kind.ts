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

export const INSURANCE_ATTACHMENT_KINDS: readonly InsuranceAttachmentKind[] = [
  "policy_document",
  "endorsement",
  "binder",
  "other",
] as const;

export const INSURANCE_ATTACHMENT_KIND_LABELS: Record<InsuranceAttachmentKind, string> = {
  policy_document: "Policy Document",
  endorsement: "Endorsement",
  binder: "Binder",
  other: "Other",
};
