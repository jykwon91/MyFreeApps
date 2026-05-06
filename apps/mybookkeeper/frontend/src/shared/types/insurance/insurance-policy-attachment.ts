import type { InsuranceAttachmentKind } from "@/shared/types/insurance/insurance-attachment-kind";

/**
 * A file attached to an insurance policy.
 *
 * Mirrors ``schemas/insurance/insurance_policy_attachment_response.py``.
 */
export interface InsurancePolicyAttachment {
  id: string;
  policy_id: string;
  filename: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  kind: InsuranceAttachmentKind;
  uploaded_by_user_id: string;
  uploaded_at: string;
  presigned_url: string | null;
  /** `false` when the underlying MinIO object is missing. UI shows a "File missing" affordance. */
  is_available?: boolean;
}
