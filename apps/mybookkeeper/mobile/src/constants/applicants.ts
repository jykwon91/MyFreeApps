import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";

export const STAGES_READY_FOR_LEASE: readonly ApplicantStage[] = ["approved", "lease_sent"];
export const CONTRACT_LOCKED_STAGE: ApplicantStage = "lease_signed";

export const APPLICANT_EMPTY_BODY = "Applicants start as inquiries. Open an inquiry you want to move forward and promote it, then they'll show up here.";

export const APPLICANT_LOADING_MESSAGES = {
  list: "Loading your applicants",
  more: "Loading more applicants",
} as const;
