import type { VendorCategory } from "./vendor-category";

/**
 * Mirrors backend ``VendorResponse`` Pydantic schema — the full payload
 * returned by GET /vendors/{id}. Includes business contact info, pricing
 * notes, and host notes that are excluded from the rolodex list view.
 *
 * Numeric fields are serialised as strings by FastAPI (Decimal → str) so
 * the frontend treats ``hourly_rate`` as ``string | null``.
 */
export interface VendorResponse {
  id: string;
  organization_id: string;
  user_id: string;

  name: string;
  category: VendorCategory;

  phone: string | null;
  email: string | null;
  address: string | null;

  hourly_rate: string | null;
  flat_rate_notes: string | null;

  preferred: boolean;
  notes: string | null;

  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}
