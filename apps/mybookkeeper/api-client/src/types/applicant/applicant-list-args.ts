import type { ApplicantStage } from "./applicant-stage";

/**
 * Query args for the GET /applicants hook. ``stage`` is optional — omitted
 * means "all stages".
 */
export interface ApplicantListArgs {
  stage?: ApplicantStage;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
}
