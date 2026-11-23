import type { PracticeNotice } from "../types/session/practice-notice";

/** What the learner is told about their conversation, on the website and the phone. */
export const PRACTICE_NOTICE_COPY: Record<PracticeNotice, string> = {
  truncated: "Your answer was too long, so only the first part was sent. Try a shorter answer.",
  restarted:
    "This conversation was restarted, so goals shown as done earlier no longer count. What you said before is still above.",
};
