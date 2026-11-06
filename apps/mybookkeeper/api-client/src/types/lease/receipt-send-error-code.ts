/** A `detail` the send-receipt route returns. Matches `receipt_send_error_details.py`. */
export type ReceiptSendErrorCode =
  | "receipt_already_sent"
  | "receipt_send_in_progress"
  | "receipt_dismissed"
  | "receipt_send_unconfirmed"
  | "receipt_sent_not_recorded"
  | "receipt_sent_from_other_gmail"
  | "gmail_reauth_required";
