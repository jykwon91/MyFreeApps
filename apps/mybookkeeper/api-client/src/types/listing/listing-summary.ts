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
  /** Public-form slug (T0). Backfilled for pre-T0 rows; nullable while a row is mid-flush. */
  slug: string | null;
}
