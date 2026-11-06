import type { ReplySendFailure } from "@mybookkeeper/api-client/types/inquiry/reply-send-failure";
import AlertBox from "@/shared/components/ui/AlertBox";
import { INQUIRY_MESSAGES } from "@/shared/lib/inquiry-messages";
import InquiryReplySendNotice from "./InquiryReplySendNotice";

export interface InquiryReplySendStatusProps {
  waiting: boolean;
  failure: ReplySendFailure | null;
  /** An earlier send may have reached the inquirer and the reply has since changed. */
  changedAfterMightHaveSent: boolean;
}

/** Says, in the panel, what became of the last send. Both regions stay mounted so screen readers hear changes. */
export default function InquiryReplySendStatus({ waiting, failure, changedAfterMightHaveSent }: InquiryReplySendStatusProps) {
  return (
    <div data-testid="reply-send-status">
      <div aria-live="polite" data-testid="reply-send-waiting">
        {waiting ? <AlertBox variant="info">{INQUIRY_MESSAGES.replyStillSending}</AlertBox> : null}
      </div>
      <div aria-live="assertive" data-testid="reply-send-failure">
        {waiting ? null : <InquiryReplySendNotice failure={failure} changedAfterMightHaveSent={changedAfterMightHaveSent} />}
      </div>
    </div>
  );
}
