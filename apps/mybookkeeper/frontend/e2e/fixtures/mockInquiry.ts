/** One inquiry, as the list and detail endpoints return it, for no-backend specs. */
import { ORG_ID } from "./mockSession";

export const INQUIRY_ID = "00000000-0000-0000-0000-0000000000a1";
export const INQUIRY_NOTES = "Prefers a ground-floor room.\nAsked about parking.";

export const INQUIRY_SUMMARY = {
  id: INQUIRY_ID,
  source: "FF",
  listing_id: null,
  stage: "new",
  inquirer_name: "Alice Nguyen",
  inquirer_employer: "Texas Children's Hospital",
  desired_start_date: "2026-06-01",
  desired_end_date: "2026-08-31",
  gut_rating: null,
  received_at: "2026-04-25T10:00:00Z",
  spam_status: "flagged",
  spam_score: 62,
  submitted_via: "manual_entry",
  last_message_preview: "Hello, I'd love to rent for 3 months.",
  last_message_at: "2026-04-25T10:00:00Z",
};

export const INQUIRY_DETAIL = {
  ...INQUIRY_SUMMARY,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  external_inquiry_id: "I-12345",
  inquirer_email: "alice@example.com",
  inquirer_phone: "+15551234567",
  notes: INQUIRY_NOTES,
  email_message_id: null,
  linked_applicant_id: null,
  move_in_date: null,
  move_out_date: null,
  occupant_count: null,
  has_pets: null,
  pets_description: null,
  vehicle_count: null,
  current_city: null,
  employment_status: null,
  why_this_room: null,
  additional_notes: null,
  messages: [
    {
      id: "00000000-0000-0000-0000-0000000000b1",
      inquiry_id: INQUIRY_ID,
      direction: "inbound",
      channel: "email",
      from_address: "alice@example.com",
      to_address: "host@example.com",
      subject: "Inquiry about your listing",
      raw_email_body: "Hello, I'd love to rent for 3 months.",
      parsed_body: "Hello, I'd love to rent for 3 months.",
      email_message_id: "<msg-1@gmail>",
      sent_at: "2026-04-25T10:00:00Z",
      created_at: "2026-04-25T10:00:00Z",
    },
  ],
  events: [],
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};
