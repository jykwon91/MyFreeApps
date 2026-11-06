import { REPLY_SEND_ACTION } from "../constants/replySendAction";
import type { ReplySendAction } from "../types/inquiry/reply-send-action";
import type { ReplySendFailure } from "../types/inquiry/reply-send-failure";

/**
 * After a send that may have gone out, says whether sending this draft is a safe
 * retry of it (`isRetry`) or a second, different email.
 */
export function replySendAction(failure: ReplySendFailure | null, mightHaveSent: boolean, isRetry: boolean): ReplySendAction {
  if (failure === "otherAccount") return REPLY_SEND_ACTION.SEND_ANYWAY;
  if (mightHaveSent && !isRetry) return REPLY_SEND_ACTION.SEND_AS_NEW;
  if (failure === "inFlight" || failure === "notRecorded") return REPLY_SEND_ACTION.CHECK_AGAIN;
  if (failure === "unsure" || mightHaveSent) return REPLY_SEND_ACTION.TRY_AGAIN;
  return REPLY_SEND_ACTION.SEND;
}
