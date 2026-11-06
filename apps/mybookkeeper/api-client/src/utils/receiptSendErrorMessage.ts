import { RECEIPT_SEND_ERROR_MESSAGES } from "../constants/receiptSendErrorMessages";
import type { ReceiptSendErrorCode } from "../types/lease/receipt-send-error-code";
import { receiptSentFromOtherGmailMessage } from "./receiptSentFromOtherGmailMessage";
import { sentFromOtherGmail } from "./sentFromOtherGmail";

/** The shared words for a send refused with `code`, naming the account when the refusal does. */
export function receiptSendErrorMessage(code: ReceiptSendErrorCode, detail: unknown): string {
  const address = code === "receipt_sent_from_other_gmail" ? sentFromOtherGmail(detail, code) : null;
  return address === null ? RECEIPT_SEND_ERROR_MESSAGES[code] : receiptSentFromOtherGmailMessage(address);
}
