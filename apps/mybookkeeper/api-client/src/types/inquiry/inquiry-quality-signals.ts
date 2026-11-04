export interface InquiryQualitySignals {
  desired_start_date: string | null;
  desired_end_date: string | null;
  inquirer_employer: string | null;
  // For inbox cards we pass last_message_preview (truncated to 120 chars
  // server-side, so this max-out at 120). For the detail view we pass the
  // full last inbound message body (uncapped).
  last_message_body: string | null;
}
