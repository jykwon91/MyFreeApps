import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

/** For a card that only needs the session: preparing, finishing. */
export interface ResumeSessionCardProps {
  session: RefinementSession;
}
