import type { ListingRoomType } from "@mybookkeeper/api-client/types/listing/listing-room-type";
import type { ListingSource } from "@mybookkeeper/api-client/types/listing/listing-source";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import type { BadgeColor } from "@/shared/components/ui/Badge";

export const LISTING_ROOM_TYPES: readonly ListingRoomType[] = [
  "private_room",
  "whole_unit",
  "shared",
] as const;

export const LISTING_SOURCES: readonly ListingSource[] = [
  "FF",
  "TNH",
  "Airbnb",
  "direct",
] as const;

export const LISTING_STATUS_BADGE_COLORS: Record<ListingStatus, BadgeColor> = {
  active: "green",
  paused: "yellow",
  draft: "gray",
  archived: "red",
};

export const LISTING_SOURCE_LABELS: Record<ListingSource, string> = {
  FF: "Furnished Finder",
  TNH: "Travel Nurse Housing",
  Airbnb: "Airbnb",
  direct: "Direct",
};

// LISTING_SOURCE_SHORT_LABELS and LISTING_SOURCE_BADGE_COLORS removed —
// SourceBadge now owns the canonical label / color / icon table for both
// listings AND inquiries (see shared/components/ui/SourceBadge.tsx). Keeping
// the per-domain copies invited drift.
