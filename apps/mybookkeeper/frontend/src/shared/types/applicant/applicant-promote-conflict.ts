/**
 * Backend's 409 ``detail`` payload from POST /applicants/promote/{inquiry_id}.
 *
 * Two distinct conflict shapes:
 * - ``already_promoted`` carries the existing applicant_id so the UI can
 *   navigate the host to the existing applicant.
 * - ``not_promotable`` carries the inquiry stage that blocked the promotion
 *   (always ``declined`` or ``archived``).
 */
export interface ApplicantPromoteAlreadyPromotedDetail {
  code: "already_promoted";
  message: string;
  applicant_id: string;
}

export interface ApplicantPromoteNotPromotableDetail {
  code: "not_promotable";
  message: string;
  stage: string;
}

export type ApplicantPromoteConflictDetail =
  | ApplicantPromoteAlreadyPromotedDetail
  | ApplicantPromoteNotPromotableDetail;
