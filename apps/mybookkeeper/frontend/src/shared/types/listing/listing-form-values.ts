import type { ListingRoomType } from "@/shared/types/listing/listing-room-type";
import type { ListingStatus } from "@/shared/types/listing/listing-status";

/**
 * Shape of the React Hook Form values for ListingForm.
 *
 * Numeric fields are typed as strings so empty inputs round-trip cleanly
 * through `<input type="number">` — the form helper converts them to
 * Decimal strings for the API on submit.
 */
export interface ListingFormValues {
  property_id: string;
  title: string;
  description: string;
  monthly_rate: string;
  weekly_rate: string;
  nightly_rate: string;
  min_stay_days: string;
  max_stay_days: string;
  room_type: ListingRoomType;
  private_bath: boolean;
  parking_assigned: boolean;
  furnished: boolean;
  status: ListingStatus;
  amenities: string;  // comma-separated; split on submit
  pets_on_premises: boolean;
  large_dog_disclosure: string;
}
