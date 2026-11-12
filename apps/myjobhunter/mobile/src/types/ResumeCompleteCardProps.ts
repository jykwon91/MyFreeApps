import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";
import type { ResumeExportShare } from "./ResumeExportShare";

export interface ResumeCompleteCardProps {
  session: RefinementSession;
  /** Held above the card, which unmounts on a switch to Draft, so a download in flight is still known. */
  exports: ResumeExportShare;
}
