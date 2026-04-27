import type { InquiryEvent } from "./inquiry-event";
import type { InquiryMessage } from "./inquiry-message";
import type { InquirySource } from "./inquiry-source";
import type { InquiryStage } from "./inquiry-stage";

/**
 * Mirrors backend ``InquiryResponse`` — the full inquiry detail shape with
 * messages and events nested.
 *
 * PII fields (``inquirer_*``) come over the wire as plaintext — the backend's
 * ``EncryptedString`` TypeDecorator decrypts on read. The frontend never sees
 * ciphertext.
 */
export interface InquiryResponse {
  id: string;
  organization_id: string;
  user_id: string;
  listing_id: string | null;

  source: InquirySource;
  external_inquiry_id: string | null;

  inquirer_name: string | null;
  inquirer_email: string | null;
  inquirer_phone: string | null;
  inquirer_employer: string | null;

  desired_start_date: string | null;
  desired_end_date: string | null;

  stage: InquiryStage;
  gut_rating: number | null;
  notes: string | null;

  received_at: string;
  email_message_id: string | null;

  messages: InquiryMessage[];
  events: InquiryEvent[];

  created_at: string;
  updated_at: string;
}
