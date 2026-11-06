import { errorDetail } from "@mybookkeeper/api-client/utils/errorDetail";
import { receiptSendErrorCode } from "@mybookkeeper/api-client/utils/receiptSendErrorCode";
import { receiptSendErrorMessage as sharedReceiptSendErrorMessage } from "@mybookkeeper/api-client/utils/receiptSendErrorMessage";
import { getApiErrorDetail } from "@/shared/lib/api-error-detail";
import { PENDING_RECEIPT_MESSAGES } from "@/shared/lib/pending-receipt-messages";
import {
  RECEIPT_SEND_FALLBACK_MESSAGE,
  RECEIPT_SEND_FIXED_BY_RECONNECTING,
  RECEIPT_SEND_NOTHING_TO_SEND_HERE,
} from "@/shared/lib/receipt-send-constants";

/** What to tell the operator when sending a rent receipt fails. The messages are shared with the phone. */
export function receiptSendErrorMessage(error: unknown): string {
  const detail = errorDetail(error);
  const code = receiptSendErrorCode(detail);
  if (code === null) return getApiErrorDetail(error, RECEIPT_SEND_FALLBACK_MESSAGE);
  const message = sharedReceiptSendErrorMessage(code, detail);
  return RECEIPT_SEND_FIXED_BY_RECONNECTING.has(code) ? `${message} ${PENDING_RECEIPT_MESSAGES.reconnectHere}` : message;
}

export function receiptSendClosesDialog(error: unknown): boolean {
  const code = receiptSendErrorCode(errorDetail(error));
  return code !== null && RECEIPT_SEND_NOTHING_TO_SEND_HERE.has(code);
}
