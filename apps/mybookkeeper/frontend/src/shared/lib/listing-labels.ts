import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import type { BadgeColor } from "@/shared/components/ui/Badge";

export const LISTING_STATUS_BADGE_COLORS: Record<ListingStatus, BadgeColor> = {
  active: "green",
  paused: "yellow",
  draft: "gray",
  archived: "red",
};
