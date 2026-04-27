import type { ListingRoomType } from "@/shared/types/listing/listing-room-type";
import type { ListingSource } from "@/shared/types/listing/listing-source";
import type { ListingStatus } from "@/shared/types/listing/listing-status";
import type { BadgeColor } from "@/shared/components/ui/Badge";

export const LISTING_STATUSES: readonly ListingStatus[] = [
  "active",
  "paused",
  "draft",
  "archived",
] as const;

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

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  active: "Active",
  paused: "Paused",
  draft: "Draft",
  archived: "Archived",
};

export const LISTING_STATUS_BADGE_COLORS: Record<ListingStatus, BadgeColor> = {
  active: "green",
  paused: "yellow",
  draft: "gray",
  archived: "red",
};

export const LISTING_ROOM_TYPE_LABELS: Record<ListingRoomType, string> = {
  private_room: "Private Room",
  whole_unit: "Whole Unit",
  shared: "Shared Room",
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

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatRate(rate: string | null | undefined): string {
  if (rate === null || rate === undefined || rate === "") return "—";
  const value = Number(rate);
  if (!Number.isFinite(value)) return "—";
  return USD_FORMATTER.format(value);
}

export const LISTING_PAGE_SIZE = 25;
