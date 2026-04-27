import type { ListingRoomType } from "./listing-room-type";
import type { ListingStatus } from "./listing-status";

/**
 * Mirrors backend `ListingSummary` Pydantic schema.
 * Decimal fields (monthly_rate) come over the wire as strings — see ListingResponse for rationale.
 */
export interface ListingSummary {
  id: string;
  title: string;
  status: ListingStatus;
  room_type: ListingRoomType;
  monthly_rate: string;
  property_id: string;
  created_at: string;
}
