import type { LeaseAttachmentKind } from "@/shared/types/lease/lease-attachment-kind";

/**
 * A file attached to a signed lease.
 *
 * Mirrors `schemas/leases/signed_lease_attachment_response.py`.
 */
export interface SignedLeaseAttachment {
  id: string;
  lease_id: string;
  filename: string;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  kind: LeaseAttachmentKind;
  uploaded_by_user_id: string;
  uploaded_at: string;
  presigned_url: string | null;
  /**
   * `false` when the underlying MinIO object is missing (NoSuchKey on HEAD).
   * The UI surfaces a "File missing — re-upload" affordance instead of the
   * normal Open / Download links so the user gets an actionable error.
   * Defaults to `true` for backwards-compat with older API responses.
   */
  is_available: boolean;
}
