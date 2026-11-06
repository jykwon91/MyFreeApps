import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";

/** The "about you" answers (`hooks/featureRequests/useAboutYou.ts`). */
export interface AboutYouState {
  context: SubmissionContext;
  /** One line for the collapsed disclosure — "Using your saved Warlock, 21–30" — or "" when nothing is set. */
  summary: string;
  update: (patch: Partial<SubmissionContext>) => void;
  /** Send nothing about you. */
  clear: () => void;
}
