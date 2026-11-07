/** One listing, as the list and detail endpoints return it, for no-backend specs. */
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";

export const LISTING_ID = "listing-1";

export const LISTING_SUMMARY: ListingSummary = {
  id: LISTING_ID,
  title: "Garage Suite A",
  status: "active",
  room_type: "private_room",
  monthly_rate: "1799.00",
  property_id: "prop-1",
  created_at: "2026-01-01T00:00:00Z",
  slug: "garage-suite-a-abc123",
};

export const LISTING: ListingResponse = {
  ...LISTING_SUMMARY,
  organization_id: "org-1",
  user_id: "user-1",
  description: null,
  weekly_rate: null,
  nightly_rate: null,
  min_stay_days: null,
  max_stay_days: null,
  private_bath: true,
  parking_assigned: false,
  furnished: true,
  amenities: [],
  pets_on_premises: false,
  large_dog_disclosure: null,
  photos: [
    {
      id: "photo-1", listing_id: LISTING_ID, storage_key: "k1", caption: null,
      display_order: 0, created_at: "2026-01-01T00:00:00Z", presigned_url: null,
    },
  ],
  external_ids: [
    {
      id: "ext-1", listing_id: LISTING_ID, source: "FF", external_id: "FF-12345",
      external_url: "https://example.com/ff/12345", created_at: "2026-01-01T00:00:00Z",
    },
  ],
  updated_at: "2026-01-01T00:00:00Z",
};
