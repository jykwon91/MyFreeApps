import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import { replyMightHaveSent } from "@mybookkeeper/api-client/utils/replyMightHaveSent";
import AlertBox from "@/shared/components/ui/AlertBox";
import { INQUIRY_MESSAGES, REPLY_SEND_FAILURE_WORDS } from "@/shared/lib/inquiry-messages";

export interface InquiryReplySendNoticeProps {
  failure: ReplySendFailure | null;
  changedAfterMightHaveSent: boolean;
}

/** What the last send means for the reply as it now stands, if anything. */
export default function InquiryReplySendNotice({ failure, changedAfterMightHaveSent }: InquiryReplySendNoticeProps) {
  if (failure) {
    return (
      <AlertBox variant={replyMightHaveSent(failure) ? "warning" : "error"}>
        {REPLY_SEND_FAILURE_WORDS[failure]}
      </AlertBox>
    );
  }
  if (changedAfterMightHaveSent) {
    return <AlertBox variant="warning">{INQUIRY_MESSAGES.replyChangedAfterMightHaveSent}</AlertBox>;
  }
  return null;
}
