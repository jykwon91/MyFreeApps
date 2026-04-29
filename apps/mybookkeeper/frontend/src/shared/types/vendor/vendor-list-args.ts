import type { VendorCategory } from "./vendor-category";

/**
 * Query args for the GET /vendors hook. ``category`` omitted means "all
 * categories"; ``preferred`` omitted means "all vendors regardless of
 * preferred flag".
 */
export interface VendorListArgs {
  category?: VendorCategory;
  preferred?: boolean;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
}
