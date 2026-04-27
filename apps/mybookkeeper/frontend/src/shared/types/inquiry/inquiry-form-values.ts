import type { InquirySource } from "./inquiry-source";

/**
 * Shape of the InquiryForm's react-hook-form state. All fields are strings
 * (date inputs return strings, listing dropdown stores the UUID string, etc.)
 * — conversion happens at submit time via ``formValuesToCreateRequest``.
 */
export interface InquiryFormValues {
  source: InquirySource;
  external_inquiry_id: string;

  listing_id: string;

  inquirer_name: string;
  inquirer_email: string;
  inquirer_phone: string;
  inquirer_employer: string;

  desired_start_date: string;
  desired_end_date: string;

  notes: string;

  // datetime-local string. Defaults to "now" but the host can backdate.
  received_at: string;
}
