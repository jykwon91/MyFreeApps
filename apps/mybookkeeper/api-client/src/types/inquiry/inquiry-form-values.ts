import type { InquirySource } from "./inquiry-source";

/**
 * What the add-inquiry form holds, on the website and the phone. Every field is a string so it maps
 * straight onto an input; ``inquiryFormToCreateRequest`` turns it into the request body.
 */
export interface InquiryFormValues {
  source: InquirySource;
  external_inquiry_id: string;

  /** A listing id, or "" for not yet linked. */
  listing_id: string;

  inquirer_name: string;
  inquirer_email: string;
  inquirer_phone: string;
  inquirer_employer: string;

  /** "yyyy-MM-dd", or "" when not set. */
  desired_start_date: string;
  desired_end_date: string;

  notes: string;

  /** Local time as "yyyy-MM-ddTHH:mm" (an HTML datetime-local value). Defaults to now; the host can backdate. */
  received_at: string;
}
