import type { VendorCategory } from "./vendor-category";

/** What the vendor form holds: every field as the person typed it, so a number is still a string. */
export interface VendorFormValues {
  name: string;
  category: VendorCategory;
  phone: string;
  email: string;
  address: string;
  hourly_rate: string;
  flat_rate_notes: string;
  preferred: boolean;
  notes: string;
}
