import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import { replySendAction } from "@mybookkeeper/api-client/utils/replySendAction";
import { REPLY_SEND_LABELS } from "@/shared/lib/inquiry-messages";

export function replySendLabel(failure: ReplySendFailure | null, mightHaveSent: boolean, isRetry: boolean): string {
  return REPLY_SEND_LABELS[replySendAction(failure, mightHaveSent, isRetry)];
}
