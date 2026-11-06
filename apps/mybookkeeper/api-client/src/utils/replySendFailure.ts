import {
  REPLY_GMAIL_REAUTH_REQUIRED,
  REPLY_NO_RECIPIENT,
  REPLY_REQUEST_ID_REUSED,
  REPLY_SEND_IN_PROGRESS,
  REPLY_SENT_NOT_RECORDED,
} from "../constants/replySendDetails";
import type { ReplySendFailure } from "../types/inquiry/reply-send-failure";
import { errorDetail } from "./errorDetail";
import { httpStatus } from "./httpStatus";

export function replySendFailure(error: unknown): ReplySendFailure {
  const status = httpStatus(error);
  const detail = errorDetail(error);
  if (status === 403) return "viewOnly";
  if (status === 404) return "gone";
  if (status === 409 && detail === REPLY_SEND_IN_PROGRESS) return "inFlight";
  if (status === 422) {
    if (detail === REPLY_NO_RECIPIENT) return "noRecipient";
    if (detail === REPLY_REQUEST_ID_REUSED) return "refused";
    // The route's Gmail refusals are sentences. A list is the request failing validation.
    return typeof detail === "string" ? "gmailConnection" : "refused";
  }
  if (status === 500 && detail === REPLY_SENT_NOT_RECORDED) return "notRecorded";
  if (status === 502) return "gmailRejected";
  if (status === 503 && detail === REPLY_GMAIL_REAUTH_REQUIRED) return "gmailDisconnected";
  // No answer, or a server fault: Gmail may have sent it before things went wrong.
  return status === undefined || status >= 500 ? "unsure" : "refused";
}
