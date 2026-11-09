import type { InsuranceAttachmentKind } from "../types/insurance/insurance-attachment-kind";

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
