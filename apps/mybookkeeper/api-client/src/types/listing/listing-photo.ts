export interface ListingPhoto {
  id: string;
  listing_id: string;
  storage_key: string;
  caption: string | null;
  display_order: number;
  created_at: string;
  // Signed URL valid for ~1 hour, minted server-side per request. Null when
  // storage is unavailable, undefined for legacy callers — UI must render a
  // placeholder in either case.
  presigned_url?: string | null;
  /** `false` when the underlying MinIO object is missing. UI shows a placeholder. */
  is_available?: boolean;
}
