/**
 * Request body for PATCH /listings/{listing_id}/external-ids/{external_id_pk}.
 *
 * Only `external_id` and `external_url` are mutable. To change `source`,
 * delete the row and create a new one.
 */
export interface ListingExternalIdUpdateRequest {
  external_id?: string | null;
  external_url?: string | null;
}
