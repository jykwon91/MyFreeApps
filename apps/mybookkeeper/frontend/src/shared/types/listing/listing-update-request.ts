import type { ListingRoomType } from "@/shared/types/listing/listing-room-type";
import type { ListingStatus } from "@/shared/types/listing/listing-status";

/**
 * Request body for PUT /listings/{id} — every field optional.
 *
 * Only fields present in the body are updated. The backend applies an
 * explicit allowlist before any setattr (see `update_listing` in
 * `backend/app/repositories/listings/listing_repo.py`).
 */
export interface ListingUpdateRequest {
  property_id?: string;
  title?: string;
  description?: string | null;
  monthly_rate?: string;
  weekly_rate?: string | null;
  nightly_rate?: string | null;
  min_stay_days?: number | null;
  max_stay_days?: number | null;
  room_type?: ListingRoomType;
  private_bath?: boolean;
  parking_assigned?: boolean;
  furnished?: boolean;
  status?: ListingStatus;
  amenities?: string[];
  pets_on_premises?: boolean;
  large_dog_disclosure?: string | null;
}
