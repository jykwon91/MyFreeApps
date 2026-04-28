/**
 * Pipeline stages an applicant can transition through.
 *
 * Mirrors backend ``APPLICANT_STAGES``. Order matches the funnel:
 * lead → screening_pending → screening_passed → video_call_done → approved
 * → lease_sent → lease_signed, with screening_failed / declined as terminal
 * off-funnel states.
 */
export type ApplicantStage =
  | "lead"
  | "screening_pending"
  | "screening_passed"
  | "screening_failed"
  | "video_call_done"
  | "approved"
  | "lease_sent"
  | "lease_signed"
  | "declined";
