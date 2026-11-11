import type { RefinementProposalControls } from "@myjobhunter/api-client/types/resume-refinement/refinement-proposal-controls";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

export interface ResumeSuggestionCardProps {
  session: RefinementSession;
  proposal: RefinementProposalControls;
  /** Shown inside the Write my own sheet, where a toast would sit behind it. */
  customFailure: string | null;
}
