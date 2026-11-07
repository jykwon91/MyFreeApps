/** Fields the test-only /test/seed-inquiry endpoint accepts (InquiryCreateRequest). */
export interface SeedInquiryPayload {
  source?: "FF" | "TNH" | "direct" | "other" | "public_form";
  external_inquiry_id?: string | null;
  inquirer_name?: string | null;
  inquirer_email?: string | null;
  inquirer_phone?: string | null;
  inquirer_employer?: string | null;
  desired_start_date?: string | null;
  desired_end_date?: string | null;
  listing_id?: string | null;
  notes?: string | null;
  received_at?: string;
  email_message_id?: string | null;
  gut_rating?: number | null;
}
