import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { VendorCategory } from "@/shared/types/vendor/vendor-category";

/**
 * Category label & color tables for the Vendors domain.
 *
 * Mirrors backend tuples in ``app/core/vendor_enums.py`` — keep both in
 * sync when categories are added (canonical source of truth is the backend
 * ``CheckConstraint`` per RENTALS_PLAN.md §4.1).
 */

export const VENDOR_CATEGORIES: readonly VendorCategory[] = [
  "handyman",
  "plumber",
  "electrician",
  "hvac",
  "locksmith",
  "cleaner",
  "pest",
  "landscaper",
  "general_contractor",
] as const;

export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  handyman: "Handyman",
  plumber: "Plumber",
  electrician: "Electrician",
  hvac: "HVAC",
  locksmith: "Locksmith",
  cleaner: "Cleaner",
  pest: "Pest Control",
  landscaper: "Landscaper",
  general_contractor: "General Contractor",
};

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

export const VENDOR_PAGE_SIZE = 25;
