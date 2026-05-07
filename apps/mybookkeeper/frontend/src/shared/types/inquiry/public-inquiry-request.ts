import type { EmploymentStatus } from "./employment-status";

/**
 * Body for ``POST /api/inquiries/public``. Mirrors backend
 * ``PublicInquiryRequest`` — every field is enforced server-side, this type
 * is only the client contract.
 */
export interface PublicInquiryRequest {
  listing_slug: string;
  name: string;
  email: string;
  phone: string;
  move_in_date: string;
  move_out_date: string;
  occupant_count: number;
  has_pets: boolean;
  pets_description: string | null;
  vehicle_count: number;
  current_city: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "US"). */
  current_country: string;
  /** State / province / region. For US, the 2-letter state code. */
  current_region: string;
  employment_status: EmploymentStatus;
  why_this_room: string;
  additional_notes: string | null;
  /** Millisecond timestamp captured at form mount. */
  form_loaded_at: number;
  /** Honeypot — visually hidden in the form. */
  website: string;
  /** Cloudflare Turnstile token. Empty string when secret_key not configured. */
  turnstile_token: string;
}
