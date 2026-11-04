import type { ListingSource } from "./listing-source";

export interface ListingExternalId {
  id: string;
  listing_id: string;
  source: ListingSource;
  external_id: string | null;
  external_url: string | null;
  created_at: string;
}
