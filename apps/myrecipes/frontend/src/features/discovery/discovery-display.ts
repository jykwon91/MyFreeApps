import type { BadgeColor } from "@platform/ui/components/ui/Badge";
import type { DiscoverySourceType } from "@myrecipes/api-client/types/recipe/discovery";

/**
 * Badge colour per source type. Labels and the other display helpers are shared with the phone
 * from @myrecipes/api-client; the colour is the website's own Badge palette. Exhaustive on
 * purpose, so a new source type fails to compile until it has a colour.
 */
export const SOURCE_COLORS: Record<DiscoverySourceType, BadgeColor> = {
  website: "blue",
  youtube: "red",
  reddit: "orange",
  blog: "purple",
  video: "red",
  forum: "gray",
};
