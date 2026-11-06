import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import { INQUIRY_MESSAGES } from "@/shared/lib/inquiry-messages";

/**
 * After a send that may have gone out, the button says whether this send is a
 * safe retry of it or a second, different email.
 */
export function replySendLabel(failure: ReplySendFailure | null, mightHaveSent: boolean, isRetry: boolean): string {
  if (mightHaveSent && !isRetry) return INQUIRY_MESSAGES.replySendAsNewButton;
  if (failure === "inFlight" || failure === "notRecorded") return INQUIRY_MESSAGES.replyCheckAgainButton;
  if (failure === "unsure" || mightHaveSent) return INQUIRY_MESSAGES.replyTryAgainButton;
  return INQUIRY_MESSAGES.replySendButton;
}
