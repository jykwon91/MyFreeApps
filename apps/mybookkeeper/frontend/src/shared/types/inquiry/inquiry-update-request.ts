import type { InquiryStage } from "./inquiry-stage";

/**
 * Body for PATCH /inquiries/{id} — every field optional, only the explicitly
 * provided fields are updated server-side.
 *
 * Per backend allowlist: ``source``, ``external_inquiry_id``, and
 * ``email_message_id`` are NOT updatable. Use stage='archived' to retire a
 * mis-routed inquiry.
 */
export interface InquiryUpdateRequest {
  listing_id?: string | null;

  inquirer_name?: string | null;
  inquirer_email?: string | null;
  inquirer_phone?: string | null;
  inquirer_employer?: string | null;

  desired_start_date?: string | null;
  desired_end_date?: string | null;

  stage?: InquiryStage;
  gut_rating?: number | null;
  notes?: string | null;
}
