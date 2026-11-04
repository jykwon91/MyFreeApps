import type { InquirySource } from "./inquiry-source";

/**
 * Body for POST /inquiries (manual create). Mirrors backend
 * ``InquiryCreateRequest``.
 *
 * Validation invariants enforced server-side (frontend mirrors for early
 * feedback):
 *   - ``external_inquiry_id`` is required when ``source !== "direct"``.
 *   - ``desired_start_date <= desired_end_date`` if both set.
 *   - All PII fields are optional — manual entries can be partial.
 */
export interface InquiryCreateRequest {
  listing_id: string | null;

  source: InquirySource;
  external_inquiry_id: string | null;

  inquirer_name: string | null;
  inquirer_email: string | null;
  inquirer_phone: string | null;
  inquirer_employer: string | null;

  desired_start_date: string | null;
  desired_end_date: string | null;

  notes: string | null;

  received_at: string;
}
