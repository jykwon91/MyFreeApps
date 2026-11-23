import { AlertBox } from "@platform/ui";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { PRACTICE_NOTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceNoticeCopy";
import type { PracticeNoticeAlertProps } from "@/types/session/practice-notice-alert-props";

/** Something the learner should know about their conversation (an answer shortened, a restart) -- not a failure. */
export default function PracticeNoticeAlert({ notice, onDismiss }: PracticeNoticeAlertProps) {
  return (
    <AlertBox variant="info">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status">{PRACTICE_NOTICE_COPY[notice]}</span>
        <button type="button" onClick={onDismiss} className="min-h-[44px] rounded-md px-3 font-medium underline">
          {PRACTICE_COPY.dismiss}
        </button>
      </div>
    </AlertBox>
  );
}
