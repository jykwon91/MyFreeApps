import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";

export const STAGES_READY_FOR_LEASE: readonly ApplicantStage[] = ["approved", "lease_sent"];
export const CONTRACT_LOCKED_STAGE: ApplicantStage = "lease_signed";
