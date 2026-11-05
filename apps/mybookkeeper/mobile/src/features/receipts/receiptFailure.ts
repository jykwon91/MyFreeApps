import { DEMO_EMAIL_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import { RECEIPT_SEND_ERROR_MESSAGES } from "@mybookkeeper/api-client/constants/receiptSendErrorMessages";
import { RECEIPT_SEND_FINISHED_CODES } from "@mybookkeeper/api-client/constants/receiptSendFinishedCodes";
import { isDemoRefusal } from "@mybookkeeper/api-client/utils/isDemoRefusal";
import { receiptSendErrorCode } from "@mybookkeeper/api-client/utils/receiptSendErrorCode";
import { FIX_ON_WEBSITE, RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import type { ReceiptDismissFailure } from "../../types/ReceiptDismissFailure";
import type { ReceiptSendFailure } from "../../types/ReceiptSendFailure";
import { httpStatus } from "../transactions/transactionMessages";

function serverDetail(error: unknown): unknown {
  return (error as { data?: { detail?: unknown } } | null)?.data?.detail;
}

/** Goes by the server's code, never its sentence: a 422's or a Gmail rejection's words aren't for the host. */
export function sendFailure(error: unknown): ReceiptSendFailure {
  const status = httpStatus(error);
  if (status === undefined) return { kind: "unsure" };
  const code = receiptSendErrorCode(serverDetail(error));
  if (code && RECEIPT_SEND_FINISHED_CODES.has(code)) return { kind: "finished", message: RECEIPT_SEND_ERROR_MESSAGES[code] };
  if (code === "gmail_reauth_required") return { kind: "recheck", fallback: `${RECEIPT_SEND_ERROR_MESSAGES[code]} ${FIX_ON_WEBSITE}` };
  if (code) return { kind: "message", message: RECEIPT_SEND_ERROR_MESSAGES[code] };
  // A 5xx without the server's own detail came from the proxy (a restart, a dropped connection), so it may have gone out.
  if (status >= 500 && typeof serverDetail(error) !== "string") return { kind: "unsure" };
  switch (status) {
    case 403:
      return { kind: "message", message: isDemoRefusal(error) ? DEMO_EMAIL_REFUSED : MESSAGES.viewerRefused };
    case 404:
      return { kind: "finished", message: MESSAGES.gone };
    case 422:
      return { kind: "recheck", fallback: MESSAGES.couldntSend };
    case 502:
      return { kind: "message", message: MESSAGES.gmailRefused };
    default:
      return { kind: "message", message: MESSAGES.couldntSend };
  }
}

export function dismissFailure(error: unknown): ReceiptDismissFailure {
  switch (httpStatus(error)) {
    case undefined:
      return { message: MESSAGES.dismissUnreachable, isFinished: false };
    case 403:
      return { message: MESSAGES.viewerRefused, isFinished: false };
    case 404:
      return { message: MESSAGES.dismissGone, isFinished: true };
    case 409:
      return { message: MESSAGES.dismissWhileSending, isFinished: false };
    // "Receipt is already sent" or "dismissed": someone got there first.
    case 422:
      return { message: MESSAGES.dismissAlreadyHandled, isFinished: true };
    default:
      return { message: MESSAGES.couldntDismiss, isFinished: false };
  }
}
