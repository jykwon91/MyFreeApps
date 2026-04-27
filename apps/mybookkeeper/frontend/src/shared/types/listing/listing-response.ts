import type { ListingExternalId } from "./listing-external-id";
import type { ListingPhoto } from "./listing-photo";
import type { ListingRoomType } from "./listing-room-type";
import type { ListingStatus } from "./listing-status";

/**
 * Mirrors backend `ListingResponse` Pydantic schema.
 * Decimal money columns are serialized as strings (Pydantic default for Decimal)
 * to preserve precision. UI formats them via Intl.NumberFormat.
 */
export interface ListingResponse {
  id: string;
  organization_id: string;
  user_id: string;
  property_id: string;

  title: string;
  description: string | null;

  monthly_rate: string;
  weekly_rate: string | null;
  nightly_rate: string | null;

  min_stay_days: number | null;
  max_stay_days: number | null;

  room_type: ListingRoomType;
  private_bath: boolean;
  parking_assigned: boolean;
  furnished: boolean;

  status: ListingStatus;
  amenities: string[];

  pets_on_premises: boolean;
  large_dog_disclosure: string | null;

  photos: ListingPhoto[];
  external_ids: ListingExternalId[];

  created_at: string;
  updated_at: string;
}
