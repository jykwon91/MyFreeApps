/**
 * A file attachment on a listing blackout row.
 *
 * Mirrors `schemas/listings/listing_blackout_attachment_response.py`.
 * `presigned_url` is null when storage is unavailable.
 */
export interface ListingBlackoutAttachment {
  id: string;
  listing_blackout_id: string;
  storage_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_user_id: string;
  uploaded_at: string;
  presigned_url: string | null;
}
