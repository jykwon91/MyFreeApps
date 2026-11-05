import type { VendorCategory } from "./vendor-category";

/**
 * Mirrors backend ``VendorUpdateRequest`` Pydantic schema (PATCH semantics).
 * Every field optional — only provided fields are applied. Fields explicitly
 * set to ``null`` clear the column on the server.
 */
export interface VendorUpdateRequest {
  name?: string;
  category?: VendorCategory;

  phone?: string | null;
  email?: string | null;
  address?: string | null;

  hourly_rate?: string | null;
  flat_rate_notes?: string | null;

  preferred?: boolean;
  notes?: string | null;
}
