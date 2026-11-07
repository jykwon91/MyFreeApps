/** Fields for ``seedVendor``; the backend fills in a name and category when omitted. */
export interface SeedVendorPayload {
  name?: string;
  category?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hourly_rate?: string | null;
  flat_rate_notes?: string | null;
  preferred?: boolean;
  notes?: string | null;
}
