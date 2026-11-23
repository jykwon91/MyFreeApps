import type { PracticeNotice } from "@mylanguagetutor/api-client/types/session/practice-notice";

export interface PracticeNoticeBannerProps {
  notice: PracticeNotice;
  onDismiss: () => void;
}
