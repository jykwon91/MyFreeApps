import type { RefinementTurn } from "@myjobhunter/api-client/types/resume-refinement/refinement-turn";

export interface ResumeTranscriptProps {
  turns: readonly RefinementTurn[];
  /** A message just sent, shown until its turn comes back. */
  pendingEcho: string | null;
}
