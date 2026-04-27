import type { ListingRoomType } from "@/shared/types/listing/listing-room-type";
import type { ListingStatus } from "@/shared/types/listing/listing-status";

/**
 * Request body for POST /listings.
 *
 * Matches `backend/app/schemas/listings/listing_create_request.py`.
 * `organization_id` and `user_id` are NOT sent — the backend resolves them
 * from the auth context.
 */
export interface ListingCreateRequest {
  property_id: string;
  title: string;
  description?: string | null;
  monthly_rate: string;
  weekly_rate?: string | null;
  nightly_rate?: string | null;
  min_stay_days?: number | null;
  max_stay_days?: number | null;
  room_type: ListingRoomType;
  private_bath?: boolean;
  parking_assigned?: boolean;
  furnished?: boolean;
  status?: ListingStatus;
  amenities?: string[];
  pets_on_premises?: boolean;
  large_dog_disclosure?: string | null;
}
