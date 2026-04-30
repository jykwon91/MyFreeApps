import type { EmploymentStatus } from "./employment-status";
import type { InquiryEvent } from "./inquiry-event";
import type { InquiryMessage } from "./inquiry-message";
import type { InquirySource } from "./inquiry-source";
import type { InquirySpamStatus } from "./inquiry-spam-status";
import type { InquiryStage } from "./inquiry-stage";
import type { InquirySubmittedVia } from "./inquiry-submitted-via";

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

  /**
   * ID of the Applicant promoted from this inquiry, or ``null`` if the
   * inquiry has not been promoted yet (PR 3.2). Lets the InquiryDetail
   * page show "View applicant" instead of "Promote to applicant" when an
   * applicant already exists.
   */
  linked_applicant_id: string | null;

  // T0 — public inquiry form fields (null on Gmail-OAuth + manual rows)
  submitted_via: InquirySubmittedVia;
  spam_status: InquirySpamStatus;
  spam_score: number | null;
  move_in_date: string | null;
  lease_length_months: number | null;
  occupant_count: number | null;
  has_pets: boolean | null;
  pets_description: string | null;
  vehicle_count: number | null;
  current_city: string | null;
  employment_status: EmploymentStatus | null;
  why_this_room: string | null;
  additional_notes: string | null;

  messages: InquiryMessage[];
  events: InquiryEvent[];

  created_at: string;
  updated_at: string;
}
