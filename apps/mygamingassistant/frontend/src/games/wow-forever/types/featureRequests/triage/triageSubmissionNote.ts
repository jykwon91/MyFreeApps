import type { SubmissionVerdict } from "@/games/wow-forever/types/featureRequests/submissionVerdict";

/** A submission linked to a story, as triage sees it on the story. `nuance_note` came from a player. */
export interface TriageSubmissionNote {
  submission_id: string;
  verdict: SubmissionVerdict;
  nuance_note: string | null;
  created_at: string;
}
