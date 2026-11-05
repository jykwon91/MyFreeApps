import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";

/**
 * Category badge colors. Visually grouped by trade family so scanning a
 * mixed rolodex feels coherent — building systems (plumber/electrician/hvac)
 * are blue, exterior trades green, mechanical/security (locksmith/handyman)
 * gray, miscellaneous in warm hues.
 */
export const VENDOR_CATEGORY_BADGE_COLORS: Record<VendorCategory, BadgeColor> = {
  handyman: "gray",
  plumber: "blue",
  electrician: "blue",
  hvac: "blue",
  locksmith: "gray",
  cleaner: "purple",
  pest: "orange",
  landscaper: "green",
  general_contractor: "yellow",
};
