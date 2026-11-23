import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { PRACTICE_NOTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceNoticeCopy";
import { Banner } from "@platform/mobile";
import type { PracticeNoticeBannerProps } from "../../types/PracticeNoticeBannerProps";

/** Something the learner should know about their conversation (an answer shortened, a restart): not a failure. */
export default function PracticeNoticeBanner({ notice, onDismiss }: PracticeNoticeBannerProps) {
  return <Banner actions={[{ label: PRACTICE_COPY.dismiss, onPress: onDismiss }]} message={PRACTICE_NOTICE_COPY[notice]} tone="info" />;
}
