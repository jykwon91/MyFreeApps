import type { InquiryMessageChannel } from "./inquiry-message-channel";
import type { InquiryMessageDirection } from "./inquiry-message-direction";

/**
 * Mirrors backend ``InquiryMessageResponse``.
 *
 * ``parsed_body`` is the canonical body for display — it's the cleaned,
 * deduplicated thread reply produced by PR 2.2's email parser. Falls back
 * to ``raw_email_body`` when no parse has been done (manual entries, or
 * outbound replies). Both are plaintext — never render via
 * ``dangerouslySetInnerHTML``.
 */
export interface InquiryMessage {
  id: string;
  inquiry_id: string;
  direction: InquiryMessageDirection;
  channel: InquiryMessageChannel;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  raw_email_body: string | null;
  parsed_body: string | null;
  email_message_id: string | null;
  sent_at: string | null;
  created_at: string;
}
