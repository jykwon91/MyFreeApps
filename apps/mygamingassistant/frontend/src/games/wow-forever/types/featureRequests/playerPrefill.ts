import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";

/** "About you" answers taken from the World Map's saved player, with the one-line summary shown for them. */
export interface PlayerPrefill {
  context: SubmissionContext;
  summary: string;
}
