import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { sessionBlockMessage } from "@mylanguagetutor/api-client/utils/sessionBlockMessage";
import { turnErrorCopy } from "@mylanguagetutor/api-client/utils/turnErrorCopy";
import { PRACTICE_NOTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceNoticeCopy";
import type { PracticeAnnouncementSources } from "@/types/session/practice-announcement-sources";

/**
 * What the practice screen's live region holds, one message per entry. The banners that show these
 * carry no live attribute of their own: a live region that arrives already filled is often not read.
 */
export function practiceAnnouncements({
  spoken,
  failure,
  recognitionHint,
  block,
  notice,
  scenarioComplete,
}: PracticeAnnouncementSources): string[] {
  const messages: string[] = [];
  if (spoken) messages.push(spoken);
  if (failure) messages.push(turnErrorCopy(failure.code));
  if (recognitionHint) messages.push(recognitionHint);
  if (block) messages.push(sessionBlockMessage(block));
  if (notice) messages.push(PRACTICE_NOTICE_COPY[notice]);
  if (scenarioComplete) messages.push(`${PRACTICE_COPY.scenarioComplete}. ${PRACTICE_COPY.scenarioCompleteBody}`);
  return messages;
}
