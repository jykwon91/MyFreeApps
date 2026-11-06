export interface InquiryReplyRequest {
  template_id?: string | null;
  subject: string;
  body: string;
  /** One per reply as written, sent with every attempt, so a retry never emails twice. */
  client_request_id?: string | null;
}
