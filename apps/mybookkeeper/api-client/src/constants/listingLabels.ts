import type { ListingRoomType } from "../types/listing/listing-room-type";
import type { ListingStatus } from "../types/listing/listing-status";

export const LISTING_STATUSES: readonly ListingStatus[] = [
  "active",
  "paused",
  "draft",
  "archived",
] as const;

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  active: "Active",
  paused: "Paused",
  draft: "Draft",
  archived: "Archived",
};

export const LISTING_ROOM_TYPE_LABELS: Record<ListingRoomType, string> = {
  private_room: "Private Room",
  whole_unit: "Whole Unit",
  shared: "Shared Room",
};

export const LISTING_PAGE_SIZE = 25;
