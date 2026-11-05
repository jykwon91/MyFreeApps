import type { VendorCategory } from "./vendor-category";

/**
 * Mirrors backend ``VendorSummary`` Pydantic schema — the rolodex-card shape
 * returned by GET /vendors.
 *
 * Carries the phone so a row can offer a call. Email, address, flat rate notes
 * and notes live on the detail page only.
 */
export interface VendorSummary {
  id: string;
  organization_id: string;
  user_id: string;

  name: string;
  category: VendorCategory;
  phone: string | null;
  hourly_rate: string | null;
  preferred: boolean;

  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}
