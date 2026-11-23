import type { PracticeNotice } from "@mylanguagetutor/api-client/types/session/practice-notice";

export interface PracticeNoticeAlertProps {
  notice: PracticeNotice;
  onDismiss: () => void;
}
