import type { ApplicantStage } from "./applicant-stage";

export interface StageTransitionRequest {
  new_stage: ApplicantStage;
  note?: string | null;
}
