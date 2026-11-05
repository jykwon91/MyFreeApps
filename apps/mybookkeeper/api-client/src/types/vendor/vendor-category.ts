/**
 * Trade categories a vendor can be tagged with.
 *
 * Mirrors backend ``VENDOR_CATEGORIES`` in ``app/core/vendor_enums.py``. Keep
 * both in sync — the canonical source of truth is the backend
 * ``CheckConstraint`` per RENTALS_PLAN.md §4.1.
 */
export type VendorCategory =
  | "handyman"
  | "plumber"
  | "electrician"
  | "hvac"
  | "locksmith"
  | "cleaner"
  | "pest"
  | "landscaper"
  | "general_contractor";
