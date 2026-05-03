import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

/**
 * Allowed stage transitions for manual host overrides.
 *
 * Mirrors ``ALLOWED_TRANSITIONS`` in
 * ``backend/app/services/applicants/applicant_stage_service.py``.
 * Keep both in sync when adding stages.
 */
export const ALLOWED_TRANSITIONS: Record<ApplicantStage, readonly ApplicantStage[]> = {
  lead: ["screening_pending", "approved", "declined"],
  screening_pending: ["screening_passed", "screening_failed", "approved", "declined"],
  screening_passed: ["video_call_done", "approved", "declined"],
  screening_failed: ["declined", "approved"],
  video_call_done: ["approved", "declined"],
  approved: ["lease_sent", "declined"],
  lease_sent: ["lease_signed", "declined"],
  lease_signed: [],
  declined: ["lead"],
};

export function getAllowedTransitions(stage: ApplicantStage): readonly ApplicantStage[] {
  return ALLOWED_TRANSITIONS[stage] ?? [];
}
