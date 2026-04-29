import type { VendorCategory } from "./vendor-category";

/**
 * Mirrors backend ``VendorCreateRequest`` Pydantic schema. Numeric fields
 * (``hourly_rate``) are sent as strings to match the backend's
 * ``Decimal | None`` field — the API serialises decimals as strings on
 * the way out, so we mirror that on the way in.
 */
export interface VendorCreateRequest {
  name: string;
  category: VendorCategory;

  phone?: string | null;
  email?: string | null;
  address?: string | null;

  hourly_rate?: string | null;
  flat_rate_notes?: string | null;

  preferred?: boolean;
  notes?: string | null;
}
