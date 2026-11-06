import type { ReceiptSendErrorCode } from "../types/lease/receipt-send-error-code";
import { receiptSentFromOtherGmailMessage } from "../utils/receiptSentFromOtherGmailMessage";

/**
 * What to say when a receipt send is refused, by the server's code. The server sends a
 * receipt at most once, so several of these mean "nothing to do" rather than "try again".
 * Each app adds where to fix it, as with `receiptReadinessMessages`.
 */
export const RECEIPT_SEND_ERROR_MESSAGES: Readonly<Record<ReceiptSendErrorCode, string>> = {
  receipt_already_sent: "That receipt already went out, so I didn't send it again.",
  receipt_dismissed: "That receipt was dismissed, so I didn't send it.",
  receipt_send_in_progress:
    "I'm still confirming an earlier send of this receipt with Gmail. Give me about 15 minutes, then try again — I won't email it twice.",
  receipt_send_unconfirmed:
    "Gmail didn't tell me whether the receipt went out. Give me about 15 minutes, then try again — I'll check Gmail first so your tenant doesn't get it twice.",
  receipt_sent_not_recorded:
    "The receipt was emailed, but I couldn't save that it was sent. Try again in about 15 minutes and I'll record it — I won't email it twice.",
  receipt_sent_from_other_gmail: receiptSentFromOtherGmailMessage("a Gmail account"),
  gmail_reauth_required: "Gmail needs to be reconnected before I can send receipts.",
};
