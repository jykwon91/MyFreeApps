import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";

export interface ReplySendNoticeProps {
  failure: ReplySendFailure | null;
  /** Gmail can't send at all, which its own banner already says. */
  isBlocked: boolean;
  changedAfterMightHaveSent: boolean;
}
