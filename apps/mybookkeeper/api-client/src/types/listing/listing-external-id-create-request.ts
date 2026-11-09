import type { ListingSource } from "./listing-source";

/**
 * Request body for POST /listings/{listing_id}/external-ids.
 *
 * At least one of `external_id` or `external_url` must be provided — the
 * server enforces this. `source` is required and must be one of the
 * canonical sources (FF/TNH/Airbnb/direct).
 */
export interface ListingExternalIdCreateRequest {
  source: ListingSource;
  external_id?: string | null;
  external_url?: string | null;
}
