import type { VendorCategory } from "../types/vendor/vendor-category";

/**
 * Mirrors backend tuples in ``app/core/vendor_enums.py``. Keep both in sync when
 * categories are added (the backend ``CheckConstraint`` is the source of truth).
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

export const VENDOR_PAGE_SIZE = 25;
