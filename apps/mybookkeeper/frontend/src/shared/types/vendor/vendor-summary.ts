import type { VendorCategory } from "./vendor-category";

/**
 * Mirrors backend ``VendorSummary`` Pydantic schema — the rolodex-card shape
 * returned by GET /vendors.
 *
 * Excludes phone / email / address / flat_rate_notes / notes per
 * RENTALS_PLAN.md §5.4 information hierarchy — those live on the detail
 * page only.
 */
export interface VendorSummary {
  id: string;
  organization_id: string;
  user_id: string;

  name: string;
  category: VendorCategory;
  hourly_rate: string | null;
  preferred: boolean;

  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}
