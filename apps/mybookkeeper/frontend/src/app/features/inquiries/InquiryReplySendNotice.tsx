import { AlertBox } from "@platform/ui";
import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import { replyMightHaveSent } from "@mybookkeeper/api-client/utils/replyMightHaveSent";
import { INQUIRY_MESSAGES, REPLY_SEND_FAILURE_WORDS, replySentFromOtherGmailWords } from "@/shared/lib/inquiry-messages";

export interface InquiryReplySendNoticeProps {
  failure: ReplySendFailure | null;
  changedAfterMightHaveSent: boolean;
  /** The account an earlier attempt went through, when it can't be checked. */
  otherGmailAddress: string | null;
}

/** What the last send means for the reply as it now stands, if anything. */
export default function InquiryReplySendNotice({ failure, changedAfterMightHaveSent, otherGmailAddress }: InquiryReplySendNoticeProps) {
  if (failure) {
    return (
      <AlertBox variant={replyMightHaveSent(failure) ? "warning" : "error"}>
        {failure === "otherAccount" && otherGmailAddress
          ? replySentFromOtherGmailWords(otherGmailAddress)
          : REPLY_SEND_FAILURE_WORDS[failure]}
      </AlertBox>
    );
  }
  if (changedAfterMightHaveSent) {
    return <AlertBox variant="warning">{INQUIRY_MESSAGES.replyChangedAfterMightHaveSent}</AlertBox>;
  }
  return null;
}
