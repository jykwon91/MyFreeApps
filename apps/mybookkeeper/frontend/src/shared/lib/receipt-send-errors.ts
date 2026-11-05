import { RECEIPT_SEND_ERROR_MESSAGES } from "@mybookkeeper/api-client/constants/receiptSendErrorMessages";
import { receiptSendErrorCode } from "@mybookkeeper/api-client/utils/receiptSendErrorCode";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";

/** What to tell the operator when sending a rent receipt fails. The messages are shared with the phone. */

export const RECEIPT_SEND_FALLBACK_MESSAGE = "Couldn't send the receipt. Please try again.";

const RECONNECT_GMAIL_HERE = "Go to Integrations → Reconnect Gmail.";

export function receiptSendErrorDetail(error: unknown): string {
  return getApiErrorDetail(error, "");
}

export function receiptSendErrorMessage(detail: string): string {
  if (detail === "") return RECEIPT_SEND_FALLBACK_MESSAGE;
  const code = receiptSendErrorCode(detail);
  if (code === null) return detail;
  const message = RECEIPT_SEND_ERROR_MESSAGES[code];
  return code === "gmail_reauth_required" ? `${message} ${RECONNECT_GMAIL_HERE}` : message;
}
