export interface ReviewQueueItem {
  id: string;
  email_message_id: string;
  source_channel: string;
  parsed_payload: ReviewQueuePayload;
  status: "pending" | "resolved" | "ignored";
  created_at: string;
}

/** Fields extracted from the booking email — never raw email body text. */
export interface ReviewQueuePayload {
  source_channel: string | null;
  source_listing_id: string | null;
  guest_name: string | null;
  check_in: string | null;
  check_out: string | null;
  total_price: string | null;
  raw_subject: string;
  booking_reference?: string;
}
